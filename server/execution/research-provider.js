import { ExecutionError } from '../lib/errors.js';
import { nowIso } from '../lib/ids.js';
import { safeFetch } from '../lib/http-client.js';
import { auditWebsite } from './site-audit.js';

function uniqueSources(sources) {
  const seen = new Set();
  return sources.filter((source) => {
    if (!source?.url || seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}

function osmFact(candidate, factPrefix, index, statement) {
  return {
    id: `${factPrefix}_f${index}`,
    type: 'verified',
    statement,
    source: {
      label: `OpenStreetMap listing for ${candidate.name}`,
      url: candidate.osm?.url ?? 'https://www.openstreetmap.org/',
      type: 'map-listing'
    },
    observedAt: candidate.discoveredAt,
    method: 'Public Nominatim search over OpenStreetMap community data'
  };
}

function buildNoWebsiteProspect(candidate, city, factPrefix, researchedAt) {
  const listing = osmFact(
    candidate,
    factPrefix,
    1,
    `OpenStreetMap lists “${candidate.name}” at ${candidate.location}.`
  );
  const noSite = osmFact(
    candidate,
    factPrefix,
    2,
    'The OpenStreetMap listing contains no website tag. Absence from this listing is not proof that the business has no website.'
  );
  return {
    id: `prospect_${factPrefix}`,
    name: candidate.name,
    location: candidate.location,
    category: candidate.category,
    coordinates: candidate.lat != null ? { lat: candidate.lat, lon: candidate.lon } : null,
    osm: candidate.osm,
    website: {
      url: null,
      finalUrl: null,
      status: null,
      verified: false,
      title: null,
      generator: null,
      bytes: null,
      elapsedMs: null,
      checkedAt: researchedAt,
      identityMatch: false,
      locationMatch: false,
      limitation: 'No website is listed in the source data; a manual search is required.'
    },
    verification: {
      status: 'SOURCE_ONLY',
      identity: 'SOURCE_LISTED',
      location: 'SOURCE_LISTED',
      website: 'NOT_LISTED',
      label: 'Business name and address are from OpenStreetMap only'
    },
    opportunity: {
      score: 0,
      priority: 'REVIEW',
      headline: 'No website listed in source data',
      summary:
        'NOVA found no website tag in the OpenStreetMap record. This is an evidence gap, not proof that no site exists.',
      signals: []
    },
    facts: [listing, noSite],
    assumptions: [
      {
        id: `${factPrefix}_a1`,
        type: 'assumption',
        statement: `${candidate.name} may need a website or may have an unlisted one; either way, manual verification is required before outreach.`,
        rationale: 'A missing OpenStreetMap tag is not evidence of a missing website.',
        basis: [listing.id, noSite.id],
        confidence: 'low'
      }
    ],
    sources: [candidate.osm?.url].filter(Boolean),
    researchedAt
  };
}

/**
 * NOVA's first real assignment.
 *
 * 1. Discover real businesses through OpenStreetMap/Nominatim.
 * 2. Inspect each official homepage directly over HTTP.
 * 3. Keep verified observations separate from assumptions.
 * 4. Return only what was actually observed, with a timestamp and source per fact.
 */
export function createResearchProvider(options = {}) {
  const {
    discovery,
    fetchPage = (url) => safeFetch(url),
    now = () => new Date(),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  } = options;

  if (!discovery) throw new Error('Research provider requires a discovery adapter.');

  return {
    id: 'nova-prospect-research',
    name: 'NOVA Prospect Research',
    async execute(task, context = {}) {
      const { niche, city, count } = task.input;
      const report = context.reportProgress ?? (() => {});
      const startedAt = nowIso();
      const limitations = [];
      const screening = { candidateCount: 0, audited: 0, verifiedCount: 0, excluded: [] };

      report('DISCOVERING', 8, `Searching OpenStreetMap for ${niche} in ${city}.`);
      const found = await discovery.discover({ niche, city, count });
      screening.candidateCount = found.candidates.length;
      screening.excluded.push(...(found.rejected ?? []));

      if (!found.candidates.length) {
        throw new ExecutionError(
          'NO_CANDIDATES',
          `OpenStreetMap returned no local businesses for “${niche}” in “${city}”. Try a broader category or city.`,
          { recoverable: true }
        );
      }

      const auditLimit = Math.min(found.candidates.length, Math.max(count * 2, 6));
      const toAudit = found.candidates.slice(0, auditLimit);
      const audits = [];

      for (let index = 0; index < toAudit.length; index += 1) {
        const candidate = toAudit[index];
        const factPrefix = `p${index + 1}`;
        if (!candidate.websiteUrl) {
          audits.push({ candidate, factPrefix, audit: null, reason: 'No website tag in source data' });
          continue;
        }
        report(
          'AUDITING',
          20 + Math.round((index / Math.max(1, toAudit.length)) * 45),
          `Inspecting ${candidate.name} (${index + 1}/${toAudit.length}).`
        );
        let page;
        try {
          page = await fetchPage(candidate.websiteUrl);
        } catch (error) {
          page = {
            requestedUrl: candidate.websiteUrl,
            error: { message: error?.message ?? 'The homepage could not be reached.' },
            fetchedAt: nowIso()
          };
        }
        const audit = auditWebsite(
          { name: candidate.name, city, websiteUrl: candidate.websiteUrl },
          page,
          { now: now().toISOString(), factPrefix }
        );
        audits.push({
          candidate,
          factPrefix,
          audit,
          reason: audit.verified ? null : audit.website.limitation
        });
        screening.audited += 1;
        await sleep(300);
      }

      const withWebsite = audits.filter((entry) => entry.audit);
      const verified = withWebsite
        .filter((entry) => entry.audit.verified && entry.audit.website.identityMatch)
        .sort((a, b) => b.audit.score - a.audit.score);
      const liveButUnconfirmed = withWebsite
        .filter((entry) => entry.audit.verified && !entry.audit.website.identityMatch)
        .sort((a, b) => b.audit.score - a.audit.score);
      const review = withWebsite
        .filter((entry) => !entry.audit.verified)
        .sort((a, b) => a.candidate.name.localeCompare(b.candidate.name));
      const noWebsite = audits.filter((entry) => !entry.audit);

      const selected = [...verified, ...liveButUnconfirmed, ...review, ...noWebsite].slice(0, count);
      screening.verifiedCount = selected.filter((entry) => entry.audit?.verified).length;

      for (const entry of audits) {
        if (selected.includes(entry)) continue;
        const reason = entry.audit?.verified
          ? 'Screened out by opportunity ranking after the requested count was filled'
          : entry.reason ?? 'Not selected';
        screening.excluded.push({ name: entry.candidate.name, reason });
      }

      report('SYNTHESIZING', 72, `Synthesising ${selected.length} evidence-backed prospect record(s).`);
      const prospects = selected.map((entry, index) => {
        const { candidate, factPrefix, audit } = entry;
        const researchedAt = nowIso();
        if (!audit) {
          return buildNoWebsiteProspect(candidate, city, factPrefix, researchedAt);
        }

        const listingFact = osmFact(
          candidate,
          factPrefix,
          1,
          `OpenStreetMap lists “${candidate.name}” at ${candidate.location}.`
        );
        const websiteTagFact = osmFact(
          candidate,
          factPrefix,
          2,
          `OpenStreetMap lists ${candidate.websiteUrl} as the website for this business.`
        );
        // Re-number audit facts after the two source-listing facts.
        const auditFacts = audit.facts.map((fact, factIndex) => ({
          ...fact,
          id: `${factPrefix}_f${factIndex + 3}`
        }));
        const factIdMap = new Map(audit.facts.map((fact, factIndex) => [fact.id, `${factPrefix}_f${factIndex + 3}`]));
        const auditAssumptions = audit.assumptions.map((assumption, assumptionIndex) => ({
          ...assumption,
          id: `${factPrefix}_a${assumptionIndex + 1}`,
          basis: assumption.basis.map((id) => factIdMap.get(id) ?? id)
        }));
        const signals = audit.opportunity.signals.map((signal, signalIndex) => ({
          ...signal,
          id: `${factPrefix}_s${signalIndex + 1}`,
          factId: factIdMap.get(signal.factId) ?? signal.factId
        }));

        const extraFacts = [];
        if (audit.website.locationMatch) {
          const cityName = city.split(',')[0].trim();
          extraFacts.push({
            id: `${factPrefix}_f${auditFacts.length + 3}`,
            type: 'verified',
            statement: `The delivered homepage references “${cityName}”, consistent with the OpenStreetMap location.`,
            source: {
              label: `${candidate.name} homepage`,
              url: audit.website.finalUrl,
              type: 'website'
            },
            observedAt: audit.website.checkedAt,
            method: 'Static HTML text inspection (JavaScript not executed)'
          });
        }
        const allFacts = [listingFact, websiteTagFact, ...auditFacts, ...extraFacts];

        const overall =
          audit.verified && audit.website.identityMatch
            ? 'VERIFIED'
            : audit.verified
              ? 'PARTIAL'
              : 'PARTIAL';
        const verification = {
          status: overall,
          identity: audit.website.identityMatch ? 'MATCHED' : 'UNCONFIRMED',
          location: audit.website.locationMatch ? 'MATCHED' : 'SOURCE_LISTED',
          website: audit.verified ? 'VERIFIED' : audit.state,
          label:
            overall !== 'VERIFIED'
              ? 'One or more checks could not be confirmed'
              : audit.website.locationMatch
                ? 'Name, listing, location and live website cross-checked'
                : 'Name, listing and live website cross-checked; location is from the source listing only'
        };

        const outreachAngle = audit.opportunity.signals.length
          ? `A concise, evidence-led teardown focused on “${audit.opportunity.signals[0].label}”${
              audit.opportunity.signals[1] ? ` and “${audit.opportunity.signals[1].label}”` : ''
            }.`
          : 'A positive check-in offering a deeper analytics and conversion review.';

        return {
          id: `prospect_${factPrefix}`,
          rank: index + 1,
          name: candidate.name,
          location: candidate.location,
          category: candidate.category,
          coordinates: candidate.lat != null ? { lat: candidate.lat, lon: candidate.lon } : null,
          osm: candidate.osm,
          website: audit.website,
          verification,
          opportunity: {
            score: audit.score,
            priority: audit.priority,
            headline: audit.opportunity.headline,
            summary: audit.opportunity.summary,
            signals,
            outreachAngle
          },
          checks: audit.checks,
          facts: allFacts,
          assumptions: [
            ...auditAssumptions,
            {
              id: `${factPrefix}_a${auditAssumptions.length + 1}`,
              type: 'assumption',
              statement: `Suggested outreach angle: ${outreachAngle}`,
              rationale: 'This is a messaging hypothesis based on observed HTML gaps, not a measured business outcome.',
              basis: signals.slice(0, 2).map((signal) => signal.factId),
              confidence: 'low'
            }
          ],
          sources: uniqueSources([
            ...allFacts.map((fact) => fact.source),
            candidate.osm?.url ? { label: 'OpenStreetMap', url: candidate.osm.url, type: 'map-listing' } : null
          ]).map((source) => source.url),
          researchedAt
        };
      });

      if (!prospects.length) {
        throw new ExecutionError(
          'NO_PROSPECTS',
          'Discovery found businesses, but none could be verified. No prospects were fabricated.',
          { recoverable: true, detail: { candidates: screening.candidateCount } }
        );
      }

      if (prospects.length < count) {
        limitations.push(
          `Requested ${count} prospects; returned ${prospects.length} because the remaining candidates could not be verified within the audit limit.`
        );
      }
      limitations.push(
        'Website findings come from static HTML inspection only. JavaScript-rendered content was not executed.',
        'OpenStreetMap is community-maintained and may be incomplete or stale.',
        'No traffic, conversion, revenue, contact or purchase-intent data was collected.',
        'No customer was contacted and no website was published or changed.'
      );

      screening.excluded = screening.excluded.slice(0, 20);

      const result = {
        assignment: {
          niche,
          city,
          requestedCount: count,
          returnedCount: prospects.length,
          requestedBy: task.input.requestedBy ?? 'HQ operator',
          provider: 'OpenStreetMap Nominatim + direct homepage inspection',
          startedAt,
          completedAt: nowIso()
        },
        prospects,
        methodology: [
          'Resolve real businesses from public OpenStreetMap data via Nominatim.',
          'Reject chains, franchises, generic names and duplicate domains.',
          'Fetch each official homepage directly over HTTP with SSRF and redirect checks.',
          'Inspect delivered HTML for identity, contact, ordering, mobile, performance and metadata signals.',
          'Rank observed gaps, then keep facts and assumptions in separate fields.'
        ],
        screening,
        limitations,
        generatedAt: nowIso()
      };

      report('DELIVERING', 92, 'Verifying that results are persisted and retrievable.');
      return result;
    }
  };
}
