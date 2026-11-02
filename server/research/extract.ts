import type {
  Opportunity,
  OpportunityLevel,
  OpportunitySignal,
  WebsiteAudit,
  WebsiteFinding,
} from "../../shared/types.ts";

const SOCIAL_HOSTS = [
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "tiktok.com",
  "youtube.com",
  "pinterest.com",
];

const BOOKING_HOSTS = [
  "resy.com",
  "opentable.",
  "sevenrooms.com",
  "tock.com",
  "calendly.com",
  "bookings.",
  "booking.",
  "square.site",
  "squareup.com",
  "toasttab.com",
  "whenworks.com",
  "simplybook.me",
];

const BOOKING_WORDS =
  /(book(?:ing)?|reserv(?:e|ation)|appointment|schedule|order online|buy online)/i;

export function decodeEntities(input: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    mdash: "—",
    ndash: "–",
    hellip: "…",
    rsquo: "’",
    lsquo: "‘",
    ldquo: "“",
    rdquo: "”",
  };
  return input
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&([a-z]+);/gi, (match, name: string) =>
      named[name.toLowerCase()] ?? match,
    );
}

export function stripTags(input: string): string {
  return decodeEntities(
    input
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = match ? stripTags(match[1]) : "";
  return title || null;
}

export function extractMeta(
  html: string,
  name: string,
): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const keys = [...tag.matchAll(/(?:name|property)\s*=\s*["']([^"']+)["']/gi)];
    if (!keys.some((key) => key[1].toLowerCase() === name.toLowerCase())) {
      continue;
    }
    const content = tag.match(/content\s*=\s*["']([\s\S]*?)["']/i);
    if (content) {
      const value = decodeEntities(content[1]).trim();
      if (value) return value;
    }
  }
  return null;
}

export function extractH1(html: string): string | null {
  const match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const heading = match ? stripTags(match[1]) : "";
  return heading || null;
}

export function extractLinks(
  html: string,
): Array<{ href: string; text: string }> {
  const links: Array<{ href: string; text: string }> = [];
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    links.push({ href: decodeEntities(match[1]), text: stripTags(match[2]) });
  }
  return links;
}

function isSocial(url: string): boolean {
  const lower = url.toLowerCase();
  return SOCIAL_HOSTS.some((host) => lower.includes(host));
}

function isBooking(link: { href: string; text: string }): boolean {
  const lower = link.href.toLowerCase();
  return (
    BOOKING_HOSTS.some((host) => lower.includes(host)) ||
    BOOKING_WORDS.test(link.text) ||
    /(book|reserv|appointment|schedule)/i.test(lower)
  );
}

function normalizeName(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nameMatch(
  businessName: string,
  title: string | null,
  h1: string | null,
  body: string,
): "STRONG" | "PARTIAL" | "NONE" {
  const target = normalizeName(businessName);
  if (!target) return "NONE";
  const haystack = `${normalizeName(title ?? "")} ${normalizeName(h1 ?? "")}`;
  if (haystack.includes(target)) return "STRONG";
  const targetTokens = target.split(" ").filter((token) => token.length > 2);
  if (targetTokens.length === 0) return "NONE";
  const bodyNorm = ` ${normalizeName(body)} `;
  const matched = targetTokens.filter((token) => bodyNorm.includes(token)).length;
  if (matched / targetTokens.length >= 0.6) return "PARTIAL";
  return "NONE";
}

export function auditHtml(
  html: string,
  businessName: string,
  contentType: string | null,
  serverHeader: string | null,
  pageBytes: number,
): WebsiteAudit {
  const links = extractLinks(html);
  const socialLinks = [
    ...new Set(links.filter((link) => isSocial(link.href)).map((link) => link.href)),
  ].slice(0, 12);
  const bookingLinks = [
    ...new Set(
      links
        .filter((link) => isBooking(link))
        .filter((link) => !isSocial(link.href))
        .map((link) => link.href),
    ),
  ].slice(0, 8);

  const copyrightMatches = [
    ...html.matchAll(/(?:©|&copy;|copyright)[^0-9]{0,24}(20\d{2})/gi),
  ].map((match) => Number(match[1]));
  const plausible = copyrightMatches.filter(
    (year) => year >= 2000 && year <= new Date().getFullYear() + 1,
  );
  const title = extractTitle(html);
  const h1 = extractH1(html);
  const bodyText = stripTags(html);

  const generatorTag = (html.match(
    /<meta\b[^>]*name\s*=\s*["']generator["'][^>]*content\s*=\s*["']([^"']+)["']/i,
  ) ?? html.match(
    /<meta\b[^>]*content\s*=\s*["']([^"']+)["'][^>]*name\s*=\s*["']generator["']/i,
  ))?.[1] ?? null;

  return {
    viewport: /<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(html),
    metaDescription: extractMeta(html, "description"),
    h1,
    socialLinks,
    bookingLinks,
    structuredData: /application\/ld\+json/i.test(html),
    copyrightYear: plausible.length ? Math.max(...plausible) : null,
    generator: generatorTag ? decodeEntities(generatorTag).trim() : null,
    forms: (html.match(/<form\b/gi) ?? []).length,
    phoneLinks: (html.match(/href\s*=\s*["']tel:/gi) ?? []).length,
    pageBytes,
    contentType,
    serverHeader,
    titleMatch: nameMatch(businessName, title, h1, bodyText),
  };
}

export function opportunityLevel(score: number): OpportunityLevel {
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
}

export function buildOpportunity(
  website: WebsiteFinding,
  responseMs: number | null,
  refs: { website: string; osm: string },
  currentYear = new Date().getFullYear(),
): Opportunity {
  const signals: OpportunitySignal[] = [];
  const add = (
    code: string,
    label: string,
    impact: number,
    evidence: string,
    sourceRefs: string[] = [refs.website],
  ) => signals.push({ code, label, impact, evidence, sourceRefs });

  if (website.verification === "UNREACHABLE") {
    add(
      "WEBSITE_UNREACHABLE",
      "Official website did not return a usable page",
      60,
      website.notes[0] ?? "The website could not be fetched during this audit.",
      [refs.website, refs.osm],
    );
  } else if (website.verification === "NOT_PROVIDED") {
    add(
      "NO_WEBSITE_TAG",
      "No official website recorded in the public directory listing",
      45,
      "OpenStreetMap has no website or contact:website tag for this business.",
      [refs.osm],
    );
  } else if (website.verification === "TAG_ONLY") {
    add(
      "WEBSITE_TAG_ONLY",
      "Website address exists but the page could not be verified",
      35,
      website.notes[0] ?? "Only the directory tag was available.",
      [refs.website, refs.osm],
    );
  }

  const audit = website.audit;
  if (audit) {
    if (!website.https) {
      add("NO_HTTPS", "No HTTPS on the audited URL", 20, "The audited URL uses plain HTTP.");
    }
    if (!audit.viewport) {
      add(
        "NO_VIEWPORT",
        "No mobile viewport meta tag",
        25,
        "The homepage HTML does not declare a responsive viewport.",
      );
    }
    if (!audit.metaDescription) {
      add(
        "NO_META_DESCRIPTION",
        "Missing meta description",
        15,
        "The homepage has no meta description, weakening search snippets.",
      );
    }
    if (audit.bookingLinks.length === 0) {
      add(
        "NO_ONLINE_BOOKING",
        "No online booking or ordering path detected",
        10,
        "No reservation, booking, appointment, or online-order link was found on the homepage.",
      );
    }
    if (audit.copyrightYear !== null && audit.copyrightYear < currentYear - 1) {
      add(
        "STALE_COPYRIGHT",
        "Outdated copyright year",
        12,
        `The footer copyright year is ${audit.copyrightYear}.`,
      );
    }
    if (audit.socialLinks.length === 0) {
      add(
        "NO_SOCIAL_LINKS",
        "No social profiles linked",
        8,
        "No links to major social platforms were found on the homepage.",
      );
    }
    if (responseMs !== null && responseMs > 2500) {
      add(
        "SLOW_RESPONSE",
        "Slow homepage response",
        10,
        `The homepage took ${Math.round(responseMs)} ms to respond.`,
      );
    }
    if (!audit.structuredData) {
      add(
        "NO_STRUCTURED_DATA",
        "No structured business data",
        8,
        "No JSON-LD structured data block was found on the homepage.",
      );
    }
    if (audit.pageBytes > 500_000) {
      add(
        "LARGE_PAGE",
        "Large homepage payload",
        5,
        `The HTML payload was ${Math.round(audit.pageBytes / 1024)} KB.`,
      );
    }
    if (audit.titleMatch === "NONE") {
      add(
        "IDENTITY_UNCLEAR",
        "Business name not confirmed in page title or heading",
        15,
        "The website loaded, but its title and main heading did not contain the listed business name.",
        [refs.website, refs.osm],
      );
    }
  }

  const rawScore = signals.reduce((total, signal) => total + signal.impact, 0);
  const score = Math.min(100, rawScore);
  const level = opportunityLevel(score);
  const top = [...signals]
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 3)
    .map((signal) => signal.label.toLowerCase());

  const summary = top.length
    ? `Observed technical refresh opportunity: ${top.join("; ")}.`
    : "No material technical opportunity was detected in the homepage audit.";

  return { level, score, summary, signals };
}
