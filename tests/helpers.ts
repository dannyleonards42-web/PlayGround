import type {
  Prospect,
  ResearchInput,
  ResearchResult,
  SourceReference,
} from "../shared/types.ts";
import type {
  ResearchContext,
  ResearchProvider,
} from "../server/research/liveResearch.ts";
import { ResearchExecutionError } from "../server/research/liveResearch.ts";

export function buildSource(
  id: string,
  kind: SourceReference["kind"],
  url: string,
  retrievedAt: string,
): SourceReference {
  return {
    id,
    kind,
    title: `${kind} source ${id}`,
    url,
    publisher: "Test fixture",
    retrievedAt,
    excerpt: `Observed evidence for ${id}`,
    contentHash: "a".repeat(64),
  };
}

export function buildProspect(index: number, timestamp: string): Prospect {
  const pid = `PRS-TEST-${index + 1}`;
  const osm = buildSource(
    `${pid}-OSM`,
    "OPENSTREETMAP",
    `https://www.openstreetmap.org/node/${1000 + index}`,
    timestamp,
  );
  const web = buildSource(
    `${pid}-WEB`,
    "WEBSITE",
    `https://example-${index + 1}.test`,
    timestamp,
  );
  const website = {
    url: web.url,
    domain: `example-${index + 1}.test`,
    verification: "PAGE_VERIFIED" as const,
    httpStatus: 200,
    finalUrl: web.url,
    https: true,
    title: `Test Business ${index + 1}`,
    description: null,
    responseMs: 120,
    contentHash: "b".repeat(64),
    audit: {
      viewport: false,
      metaDescription: null,
      h1: `Test Business ${index + 1}`,
      socialLinks: [],
      bookingLinks: [],
      structuredData: false,
      copyrightYear: 2019,
      generator: null,
      forms: 0,
      phoneLinks: 0,
      pageBytes: 2048,
      contentType: "text/html",
      serverHeader: "test",
      titleMatch: "STRONG" as const,
    },
    notes: [],
  };
  return {
    id: pid,
    rank: index + 1,
    businessName: `Test Business ${index + 1}`,
    category: "café",
    location: {
      address: `${index + 1} Test Street`,
      city: "Testville",
      country: "Ireland",
      lat: 53.27 + index * 0.001,
      lon: -9.05,
    },
    osm: { type: "node", id: 1000 + index, url: osm.url },
    website,
    opportunity: {
      level: "HIGH",
      score: 82,
      summary: "Observed technical refresh opportunity: no mobile viewport.",
      signals: [
        {
          code: "NO_VIEWPORT",
          label: "No mobile viewport meta tag",
          impact: 25,
          evidence: "The homepage HTML does not declare a responsive viewport.",
          sourceRefs: [`${pid}-WEB`],
        },
      ],
    },
    facts: [
      {
        statement: `OpenStreetMap lists Test Business ${index + 1}.`,
        sourceRefs: [`${pid}-OSM`],
      },
    ],
    assumptions: ["Owner intent is unknown."],
    sources: [osm, web],
    researchTimestamp: timestamp,
  };
}

export function buildResult(
  input: ResearchInput,
  timestamp: string,
): ResearchResult {
  const prospects = Array.from({ length: input.count }, (_, index) =>
    buildProspect(index, timestamp),
  );
  return {
    assignment: {
      city: input.city,
      category: input.category,
      requestedCount: input.count,
      deliveredCount: input.count,
    },
    prospects,
    methodology: ["Test method"],
    limitations: ["Test limitation"],
    sources: [
      buildSource(
        "SRC-CITY",
        "NOMINATIM",
        "https://nominatim.openstreetmap.org/",
        timestamp,
      ),
      ...prospects.flatMap((prospect) => prospect.sources),
    ],
    executedAt: timestamp,
    provider: "test-provider",
    candidatesExamined: input.count + 2,
    websitesAudited: input.count + 2,
  };
}

export class FakeResearchProvider implements ResearchProvider {
  readonly name = "test-provider";
  calls = 0;
  failNext = 0;

  async execute(
    input: ResearchInput,
    context: ResearchContext,
  ): Promise<ResearchResult> {
    this.calls += 1;
    await context.onProgress("AUDIT", "Fake provider auditing.", 50);
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new ResearchExecutionError(
        "UPSTREAM_UNAVAILABLE",
        "A required open-data service could not be reached.",
        "Simulated upstream timeout.",
        true,
      );
    }
    return buildResult(input, new Date().toISOString());
  }
}

export async function waitFor(
  predicate: () => Promise<boolean> | boolean,
  timeoutMs = 5_000,
  intervalMs = 20,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}
