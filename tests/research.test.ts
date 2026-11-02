import { describe, expect, it } from "vitest";
import {
  auditHtml,
  buildOpportunity,
  decodeEntities,
  extractMeta,
  extractTitle,
  stripTags,
} from "../server/research/extract.ts";
import { FetchSafetyError, isPrivateAddress, safeFetch } from "../server/research/http.ts";
import type { WebsiteFinding } from "../shared/types.ts";

const HTML = `<!doctype html>
<html>
  <head>
    <title>Bean There Café &amp; Bakery</title>
    <meta property="og:title" content="Bean There" />
  </head>
  <body>
    <h1>Bean There Café</h1>
    <p>Independent coffee on Market Street.</p>
    <footer>&copy; 2020 Bean There</footer>
  </body>
</html>`;

function page(overrides: Partial<WebsiteFinding> = {}): WebsiteFinding {
  return {
    url: "https://bean.example",
    domain: "bean.example",
    verification: "PAGE_VERIFIED",
    httpStatus: 200,
    finalUrl: "https://bean.example",
    https: true,
    title: "Bean There Café",
    description: null,
    responseMs: 300,
    contentHash: "c".repeat(64),
    audit: null,
    notes: [],
    ...overrides,
  };
}

describe("HTML extraction", () => {
  it("extracts and decodes titles, meta values, and text", () => {
    expect(extractTitle(HTML)).toBe("Bean There Café & Bakery");
    expect(extractMeta(HTML, "og:title")).toBe("Bean There");
    expect(extractMeta(HTML, "description")).toBeNull();
    expect(stripTags("<p>Hello&nbsp;<strong>world</strong></p>")).toBe(
      "Hello world",
    );
    expect(decodeEntities("A &#38; B &#x26; C")).toBe("A & B & C");
  });

  it("records only observable homepage signals", () => {
    const audit = auditHtml(HTML, "Bean There Café", "text/html", "nginx", 4096);
    expect(audit.viewport).toBe(false);
    expect(audit.metaDescription).toBeNull();
    expect(audit.h1).toBe("Bean There Café");
    expect(audit.socialLinks).toEqual([]);
    expect(audit.bookingLinks).toEqual([]);
    expect(audit.structuredData).toBe(false);
    expect(audit.copyrightYear).toBe(2020);
    expect(audit.serverHeader).toBe("nginx");
    expect(audit.titleMatch).toBe("STRONG");
  });

  it("scores a stale, non-responsive homepage as high opportunity", () => {
    const audit = auditHtml(HTML, "Bean There Café", "text/html", "nginx", 4096);
    const website = page({ audit });
    const opportunity = buildOpportunity(
      website,
      3200,
      { website: "WEB", osm: "OSM" },
      2026,
    );
    expect(opportunity.level).toBe("HIGH");
    expect(opportunity.score).toBe(88);
    const codes = opportunity.signals.map((signal) => signal.code);
    expect(codes).toContain("NO_VIEWPORT");
    expect(codes).toContain("NO_META_DESCRIPTION");
    expect(codes).toContain("STALE_COPYRIGHT");
    expect(codes).toContain("SLOW_RESPONSE");
    expect(opportunity.summary).toContain(
      "Observed technical refresh opportunity",
    );
    for (const signal of opportunity.signals) {
      expect(signal.sourceRefs.length).toBeGreaterThan(0);
    }
  });

  it("flags plain HTTP and identity mismatch", () => {
    const audit = auditHtml(HTML, "Different Company", "text/html", null, 4096);
    const website = page({
      url: "http://bean.example",
      finalUrl: "http://bean.example",
      https: false,
      audit,
    });
    const opportunity = buildOpportunity(
      website,
      200,
      { website: "WEB", osm: "OSM" },
      2026,
    );
    const codes = opportunity.signals.map((signal) => signal.code);
    expect(codes).toContain("NO_HTTPS");
    expect(codes).toContain("IDENTITY_UNCLEAR");
    expect(audit.titleMatch).toBe("NONE");
  });

  it("reports an unreachable website as evidence, not a fabricated page", () => {
    const website = page({
      verification: "UNREACHABLE",
      httpStatus: 503,
      finalUrl: null,
      audit: null,
      notes: ["The official website returned HTTP 503."],
    });
    const opportunity = buildOpportunity(
      website,
      null,
      { website: "WEB", osm: "OSM" },
      2026,
    );
    expect(opportunity.signals[0].code).toBe("WEBSITE_UNREACHABLE");
    expect(opportunity.signals[0].evidence).toContain("503");
  });
});

describe("network safety", () => {
  it("identifies private and reserved addresses", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("10.2.3.4")).toBe(true);
    expect(isPrivateAddress("172.20.1.1")).toBe(true);
    expect(isPrivateAddress("192.168.0.1")).toBe(true);
    expect(isPrivateAddress("169.254.1.2")).toBe(true);
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("fd00::1")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("1.1.1.1")).toBe(false);
  });

  it("blocks localhost before making a request", async () => {
    await expect(safeFetch("http://127.0.0.1:3999")).rejects.toBeInstanceOf(
      FetchSafetyError,
    );
    await expect(safeFetch("http://localhost:3999")).rejects.toBeInstanceOf(
      FetchSafetyError,
    );
    await expect(safeFetch("file:///etc/passwd")).rejects.toBeInstanceOf(
      FetchSafetyError,
    );
  });
});
