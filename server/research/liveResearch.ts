import { createHash } from "node:crypto";
import type {
  Prospect,
  ResearchFact,
  ResearchInput,
  ResearchResult,
  SourceReference,
  WebsiteFinding,
} from "../../shared/types.ts";
import { buildOpportunity, auditHtml, extractTitle } from "./extract.ts";
import { RESEARCH_USER_AGENT, safeFetch } from "./http.ts";
import { prospectId } from "../ids.ts";

export class ResearchExecutionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly detail: string | null = null,
    readonly retryable = true,
  ) {
    super(message);
    this.name = "ResearchExecutionError";
  }
}

export interface ResearchContext {
  onProgress: (stage: string, message: string, percent: number) => Promise<void>;
}

export interface ResearchProvider {
  readonly name: string;
  execute(
    input: ResearchInput,
    context: ResearchContext,
  ): Promise<ResearchResult>;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  boundingbox: [string, string, string, string];
  address?: Record<string, string>;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const CATEGORY_LABEL: Record<ResearchInput["category"], string> = {
  cafe: "café",
  restaurant: "restaurant",
  bakery: "bakery",
};

const CATEGORY_QUERY: Record<ResearchInput["category"], string> = {
  cafe: '["amenity"="cafe"]',
  restaurant: '["amenity"="restaurant"]',
  bakery: '["shop"="bakery"]',
};

const SOCIAL_DOMAINS = [
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "tiktok.com",
];

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "user-agent": RESEARCH_USER_AGENT,
        accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new ResearchExecutionError(
        "UPSTREAM_HTTP_ERROR",
        `Open data service returned HTTP ${response.status}.`,
        `Request to ${url} failed with status ${response.status}.`,
      );
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ResearchExecutionError) throw error;
    throw new ResearchExecutionError(
      "UPSTREAM_UNAVAILABLE",
      "A required open-data service could not be reached.",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    clearTimeout(timer);
  }
}

function normalizeWebsite(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const withScheme = value.startsWith("//")
    ? `https:${value}`
    : /^https?:\/\//i.test(value)
      ? value
      : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".")) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function isSocialUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return SOCIAL_DOMAINS.some((domain) => lower.includes(domain));
}

function addressFromTags(tags: Record<string, string>): string {
  const street = [tags["addr:housenumber"], tags["addr:street"]]
    .filter(Boolean)
    .join(" ")
    .trim();
  const parts = [
    street,
    tags["addr:unit"],
    tags["addr:postcode"],
  ].filter(Boolean);
  return parts.length
    ? parts.join(", ")
    : "Street address not tagged in OpenStreetMap";
}

function excerptForWebsite(
  finding: WebsiteFinding,
  httpStatus: number | null,
  serverHeader: string | null,
): string {
  if (finding.notes.length && finding.verification !== "PAGE_VERIFIED") {
    return finding.notes.join(" ").slice(0, 400);
  }
  const parts = [
    httpStatus ? `HTTP ${httpStatus}.` : "",
    finding.title ? `Title: ${finding.title}.` : "",
    finding.description ? `Description: ${finding.description}` : "",
    serverHeader ? `Server: ${serverHeader}.` : "",
  ].filter(Boolean);
  return parts.join(" ").slice(0, 500);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

interface Candidate {
  element: OverpassElement;
  name: string;
  websiteRaw: string | null;
  socialOnly: boolean;
}

export class LiveResearchProvider implements ResearchProvider {
  readonly name = "openstreetmap+nominatim+http-audit";

  async execute(
    input: ResearchInput,
    context: ResearchContext,
  ): Promise<ResearchResult> {
    const executedAt = new Date().toISOString();
    const label = CATEGORY_LABEL[input.category];

    await context.onProgress(
      "GEOCODE",
      `Resolving ${input.city} with Nominatim…`,
      5,
    );
    const cityUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      input.city,
    )}&format=jsonv2&addressdetails=1&limit=1`;
    const cityResults = await fetchJson<NominatimResult[]>(cityUrl, {
      headers: { accept: "application/json" },
    });
    const city = cityResults[0];
    if (!city) {
      throw new ResearchExecutionError(
        "CITY_NOT_FOUND",
        `No location matched “${input.city}”.`,
        "Nominatim returned zero results. Try a more specific city and country.",
        false,
      );
    }
    const [south, north, west, east] = city.boundingbox.map(Number);
    if ([south, north, west, east].some((value) => !Number.isFinite(value))) {
      throw new ResearchExecutionError(
        "CITY_BOUNDS_INVALID",
        "The city lookup returned unusable coordinates.",
        `Bounding box: ${city.boundingbox.join(", ")}`,
      );
    }
    const citySource: SourceReference = {
      id: "SRC-CITY",
      kind: "NOMINATIM",
      title: `Nominatim geocoding result for ${input.city}`,
      url: cityUrl,
      publisher: "OpenStreetMap / Nominatim",
      retrievedAt: executedAt,
      excerpt: `${city.display_name} — bounding box ${city.boundingbox.join(", ")}`,
    };

    await context.onProgress(
      "DIRECTORY_QUERY",
      `Searching OpenStreetMap for ${label}s with a listed website…`,
      15,
    );
    const filter = CATEGORY_QUERY[input.category];
    const bbox = `${south},${west},${north},${east}`;
    const query = `[out:json][timeout:45];
(
  nwr${filter}["website"](${bbox});
  nwr${filter}["contact:website"](${bbox});
);
out center tags 100;`;
    const overpassUrl = "https://overpass-api.de/api/interpreter";
    const overpass = await fetchJson<{ elements: OverpassElement[] }>(
      overpassUrl,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }).toString(),
      },
    );

    const seenNames = new Set<string>();
    const seenDomains = new Set<string>();
    const candidates: Candidate[] = [];
    for (const element of overpass.elements) {
      const tags = element.tags ?? {};
      const name = (tags.name ?? tags["name:en"] ?? "").trim();
      if (!name) continue;
      const nameKey = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (seenNames.has(nameKey)) continue;
      const raw = tags.website ?? tags["contact:website"] ?? null;
      const normalized = raw ? normalizeWebsite(raw) : null;
      if (normalized) {
        try {
          const domain = new URL(normalized).hostname.replace(/^www\./, "");
          if (seenDomains.has(domain)) continue;
          seenDomains.add(domain);
        } catch {
          continue;
        }
      }
      seenNames.add(nameKey);
      candidates.push({
        element,
        name,
        websiteRaw: normalized,
        socialOnly: normalized ? isSocialUrl(normalized) : false,
      });
      if (candidates.length >= 14) break;
    }

    if (candidates.length === 0) {
      throw new ResearchExecutionError(
        "NO_CANDIDATES",
        `No ${label}s with a listed website were found inside the ${input.city} boundary.`,
        "OpenStreetMap returned no matching businesses with website tags. Try another category or city.",
        false,
      );
    }

    await context.onProgress(
      "WEBSITE_AUDIT",
      `Auditing ${candidates.length} candidate homepages. No messages will be sent.`,
      30,
    );

    let audited = 0;
    const auditedCandidates = await mapWithConcurrency(
      candidates,
      3,
      async (candidate) => {
        const finding = await this.auditWebsite(candidate);
        audited += 1;
        await context.onProgress(
          "WEBSITE_AUDIT",
          `Audited ${audited}/${candidates.length}: ${candidate.name} (${finding.website.verification}).`,
          30 + Math.round((audited / candidates.length) * 55),
        );
        return { candidate, finding };
      },
    );

    const pageVerified = auditedCandidates.filter(
      (entry) => entry.finding.website.verification === "PAGE_VERIFIED",
    );
    if (pageVerified.length < input.count) {
      const summaries = auditedCandidates
        .map(
          (entry) =>
            `${entry.candidate.name}: ${entry.finding.website.verification}${entry.finding.website.httpStatus ? ` (HTTP ${entry.finding.website.httpStatus})` : ""}`,
        )
        .join("; ");
      throw new ResearchExecutionError(
        "INSUFFICIENT_VERIFIED_PROSPECTS",
        `Only ${pageVerified.length} of ${input.count} required websites could be verified.`,
        `Candidates examined: ${candidates.length}. Outcomes — ${summaries}. No results were fabricated.`,
      );
    }

    await context.onProgress(
      "SCORING",
      "Scoring observed website opportunities from audit evidence…",
      90,
    );

    const identityVerified = [...pageVerified]
      .filter((entry) => entry.finding.website.audit?.titleMatch !== "NONE")
      .sort((a, b) => b.finding.opportunity.score - a.finding.opportunity.score)
      .slice(0, input.count);
    const pool =
      identityVerified.length >= input.count
        ? identityVerified
        : [...pageVerified]
            .sort(
              (a, b) => b.finding.opportunity.score - a.finding.opportunity.score,
            )
            .slice(0, input.count);

    const sources: SourceReference[] = [citySource];
    const prospects: Prospect[] = pool.map((entry, index) => {
      const { candidate, finding } = entry;
      const element = candidate.element;
      const tags = element.tags ?? {};
      const lat = element.lat ?? element.center?.lat;
      const lon = element.lon ?? element.center?.lon;
      if (lat === undefined || lon === undefined) {
        throw new ResearchExecutionError(
          "COORDINATES_MISSING",
          `The directory record for ${candidate.name} has no coordinates.`,
          `OSM ${element.type}/${element.id}`,
          false,
        );
      }
      const pid = prospectId(index);
      const osmSourceId = `${pid}-OSM`;
      const webSourceId = `${pid}-WEB`;
      const retrievedAt = finding.website.contentHash
        ? finding.researchTimestamp
        : executedAt;
      const osmSource: SourceReference = {
        id: osmSourceId,
        kind: "OPENSTREETMAP",
        title: `OpenStreetMap record: ${candidate.name}`,
        url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
        publisher: "OpenStreetMap contributors (ODbL)",
        retrievedAt: executedAt,
        excerpt: `name=${candidate.name}; website=${
          candidate.websiteRaw ?? "not tagged"
        }; address=${addressFromTags(tags)}; city=${
          tags["addr:city"] ?? input.city
        }`,
      };
      const webSource: SourceReference = {
        id: webSourceId,
        kind: "WEBSITE",
        title: finding.website.title
          ? `Homepage: ${finding.website.title}`
          : `Homepage fetch: ${candidate.name}`,
        url: finding.website.finalUrl ?? candidate.websiteRaw ?? "",
        publisher: new URL(finding.website.finalUrl ?? candidate.websiteRaw!).hostname,
        retrievedAt,
        excerpt: excerptForWebsite(
          finding.website,
          finding.website.httpStatus,
          finding.website.audit?.serverHeader ?? null,
        ),
        contentHash: finding.website.contentHash ?? undefined,
      };
      sources.push(osmSource, webSource);

      const facts: ResearchFact[] = [];
      facts.push({
        statement: `OpenStreetMap lists “${candidate.name}” as a ${label}${
          addressFromTags(tags) === "Street address not tagged in OpenStreetMap"
            ? ""
            : ` at ${addressFromTags(tags)}`
        }, ${tags["addr:city"] ?? input.city}. Coordinates: ${lat.toFixed(6)}, ${lon.toFixed(6)}.`,
        sourceRefs: [osmSourceId],
      });
      if (finding.website.httpStatus !== null) {
        facts.push({
          statement: `The listed official website ${finding.website.finalUrl} returned HTTP ${finding.website.httpStatus} at ${retrievedAt}. Page title: ${
            finding.website.title ?? "(none)"
          }.`,
          sourceRefs: [webSourceId],
        });
      }
      if (finding.website.audit) {
        const audit = finding.website.audit;
        facts.push({
          statement: `Homepage audit observed: mobile viewport ${
            audit.viewport ? "present" : "absent"
          }; meta description ${
            audit.metaDescription ? "present" : "absent"
          }; online booking path ${
            audit.bookingLinks.length ? "present" : "absent"
          }; copyright year ${
            audit.copyrightYear ?? "not detected"
          }; business name match ${
            audit.titleMatch === "STRONG"
              ? "confirmed in title/heading"
              : audit.titleMatch === "PARTIAL"
                ? "partially confirmed in page text"
                : "not confirmed"
          }.`,
          sourceRefs: [webSourceId],
        });
      }

      const assumptions = [
        "Business identity and location rely on community-maintained OpenStreetMap data, not a company registry filing.",
        "Website ownership is inferred from the OpenStreetMap website tag; it was not independently confirmed with the owner.",
        "The need for a website refresh is inferred from observed technical signals. Owner intent and budget are unknown.",
        "The audit is a single homepage snapshot; JavaScript-rendered content and inner pages were not evaluated.",
        `${label.charAt(0).toUpperCase()}${label.slice(1)} has not been contacted. No message, publication, or spend occurred.`,
      ];
      if (finding.website.audit?.titleMatch === "NONE") {
        assumptions.push(
          "The audited website did not contain the business name in its title or main heading, so its ownership remains an assumption.",
        );
      }

      const website = finding.website;
      return {
        id: pid,
        rank: index + 1,
        businessName: candidate.name,
        category: label,
        location: {
          address: addressFromTags(tags),
          city: tags["addr:city"] ?? input.city,
          country: tags["addr:country"] ?? city.address?.country ?? "",
          lat,
          lon,
        },
        osm: {
          type: element.type,
          id: element.id,
          url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
        },
        website,
        opportunity: finding.opportunity,
        facts,
        assumptions,
        sources: [osmSource, webSource],
        researchTimestamp: retrievedAt,
      };
    });

    const uniqueSources = [
      citySource,
      ...prospects.flatMap((prospect) => prospect.sources),
    ];

    await context.onProgress(
      "RESULT_ASSEMBLY",
      `Prepared ${prospects.length} evidence-backed prospect records.`,
      95,
    );

    return {
      assignment: {
        city: city.display_name,
        category: label,
        requestedCount: input.count,
        deliveredCount: prospects.length,
      },
      prospects,
      methodology: [
        "Resolved the requested city through the public Nominatim geocoder.",
        "Queried the public Overpass API for OpenStreetMap businesses carrying a website tag inside the city bounding box.",
        "Deduplicated businesses by name and website domain.",
        "Fetched each candidate homepage over HTTP(S) with a capped response size and a private-address guard.",
        "Extracted observable technical signals from homepage HTML and response headers.",
        "Required a successful page fetch before marking an official website as PAGE_VERIFIED.",
        "Ranked prospects only by observed technical opportunity signals; no outreach or spending occurred.",
      ],
      limitations: [
        "OpenStreetMap is community-maintained; listings can be incomplete or out of date.",
        "Only the homepage was audited, once, without JavaScript execution.",
        "Technical findings do not prove commercial need, authority to buy, or budget.",
        "No phone, email, or social outreach was attempted or sent.",
        "No paid search, enrichment, or AI model service was used.",
      ],
      sources: uniqueSources,
      executedAt,
      provider: this.name,
      candidatesExamined: candidates.length,
      websitesAudited: audited,
    };
  }

  private async auditWebsite(
    candidate: Candidate,
  ): Promise<{
    website: WebsiteFinding;
    opportunity: ReturnType<typeof buildOpportunity>;
    researchTimestamp: string;
  }> {
    const osmRef = "OSM";
    const webRef = "WEB";
    if (!candidate.websiteRaw || candidate.socialOnly) {
      const website: WebsiteFinding = {
        url: candidate.websiteRaw,
        domain: candidate.websiteRaw
          ? new URL(candidate.websiteRaw).hostname
          : null,
        verification: "NOT_PROVIDED",
        httpStatus: null,
        finalUrl: null,
        https: candidate.websiteRaw?.startsWith("https://") ?? false,
        title: null,
        description: null,
        responseMs: null,
        contentHash: null,
        audit: null,
        notes: [
          candidate.socialOnly
            ? "The directory only lists a social-media profile, not an official website."
            : "No official website was recorded in the directory.",
        ],
      };
      return {
        website,
        opportunity: buildOpportunity(website, null, {
          website: webRef,
          osm: osmRef,
        }),
        researchTimestamp: new Date().toISOString(),
      };
    }

    try {
      const response = await safeFetch(candidate.websiteRaw);
      const audit = new Date().toISOString();
      const contentType = response.headers.get("content-type");
      const serverHeader = response.headers.get("server");
      const finalUrl = response.finalUrl;
      const htmlLike =
        !contentType ||
        /text\/html|application\/xhtml\+xml/i.test(contentType);
      const ok = response.status >= 200 && response.status < 300;
      if (!ok || !htmlLike) {
        const website: WebsiteFinding = {
          url: candidate.websiteRaw,
          domain: new URL(finalUrl).hostname,
          verification: !ok ? "UNREACHABLE" : "TAG_ONLY",
          httpStatus: response.status,
          finalUrl,
          https: finalUrl.startsWith("https://"),
          title: null,
          description: null,
          responseMs: Math.round(response.responseMs),
          contentHash: response.bodyText
            ? createHash("sha256").update(response.bodyText).digest("hex")
            : null,
          audit: null,
          notes: [
            !ok
              ? `The official website returned HTTP ${response.status}.`
              : `The URL returned non-HTML content (${contentType}).`,
          ],
        };
        return {
          website,
          opportunity: buildOpportunity(website, response.responseMs, {
            website: webRef,
            osm: osmRef,
          }),
          researchTimestamp: audit,
        };
      }
      const contentHash = createHash("sha256")
        .update(response.bodyText)
        .digest("hex");
      const parsed = auditHtml(
        response.bodyText,
        candidate.name,
        contentType,
        serverHeader,
        response.bytes,
      );
      const title = extractTitle(response.bodyText);
      const website: WebsiteFinding = {
        url: candidate.websiteRaw,
        domain: new URL(finalUrl).hostname,
        verification: "PAGE_VERIFIED",
        httpStatus: response.status,
        finalUrl,
        https: finalUrl.startsWith("https://"),
        title,
        description: parsed.metaDescription,
        responseMs: Math.round(response.responseMs),
        contentHash,
        audit: parsed,
        notes: response.truncated
          ? ["The homepage exceeded the 1.5 MB audit cap; analysis used the first 1.5 MB."]
          : [],
      };
      return {
        website,
        opportunity: buildOpportunity(website, response.responseMs, {
          website: webRef,
          osm: osmRef,
        }),
        researchTimestamp: audit,
      };
    } catch (error) {
      const website: WebsiteFinding = {
        url: candidate.websiteRaw,
        domain: new URL(candidate.websiteRaw).hostname,
        verification: "UNREACHABLE",
        httpStatus: null,
        finalUrl: null,
        https: candidate.websiteRaw.startsWith("https://"),
        title: null,
        description: null,
        responseMs: null,
        contentHash: null,
        audit: null,
        notes: [
          `The official website could not be fetched: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ],
      };
      return {
        website,
        opportunity: buildOpportunity(website, null, {
          website: webRef,
          osm: osmRef,
        }),
        researchTimestamp: new Date().toISOString(),
      };
    }
  }
}
