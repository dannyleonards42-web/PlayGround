import { analyzeHtml } from './html-analyzer.js';

const STOP_WORDS = new Set([
  'the', 'and', 'of', 'portland', 'oregon', 'bakery', 'bakeries', 'cafe', 'café',
  'restaurant', 'coffee', 'shop', 'store', 'company', 'inc', 'llc', 'bistro'
]);

function nameTokens(name) {
  return String(name)
    .toLowerCase()
    .split(/[^a-z0-9é]+/i)
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));
}

function looksBlocked(page, analysis) {
  if (!page) return false;
  if ([401, 403, 429, 503].includes(page.status)) return true;
  return /just a moment|access denied|blocked by (our|the) firewall|attention required|challenge/i.test(
    `${analysis?.title ?? ''} ${analysis?.text?.slice(0, 600) ?? ''}`
  );
}

function sourceFor(business, url, label = null) {
  return {
    label: label ?? `${business.name} homepage`,
    url,
    type: 'website'
  };
}

/**
 * Turn a raw webpage response into verified observations and clearly-labelled
 * assumptions. No traffic, revenue, ranking or intent data is inferred.
 */
export function auditWebsite(business, page, { now, factPrefix = 'fact' } = {}) {
  const checkedAt = page?.fetchedAt ?? now ?? new Date().toISOString();
  const websiteUrl = page?.requestedUrl ?? business.websiteUrl ?? null;
  const facts = [];
  const assumptions = [];
  const signals = [];
  let counter = 0;
  let signalCounter = 0;

  const fact = (statement, { url = page?.finalUrl ?? websiteUrl, label, method } = {}) => {
    counter += 1;
    const entry = {
      id: `${factPrefix}_f${counter}`,
      type: 'verified',
      statement,
      source: sourceFor(business, url, label),
      observedAt: checkedAt,
      method: method ?? 'Direct HTTP GET; static HTML inspection (JavaScript not executed)'
    };
    facts.push(entry);
    return entry;
  };

  const signal = (label, weight, factEntry, recommendation, severity) => {
    signalCounter += 1;
    signals.push({
      id: `${factPrefix}_s${signalCounter}`,
      label,
      weight,
      severity,
      factId: factEntry.id,
      recommendation
    });
  };

  if (!page || page.error) {
    const message = page?.error?.message ?? 'The website could not be reached.';
    const failure = fact(`Homepage could not be reached: ${message}`, {
      url: websiteUrl,
      method: 'Attempted direct HTTP GET with redirect and SSRF validation'
    });
    signal('Website unavailable for automated inspection', 0, failure, 'Perform a manual browser review before outreach.', 2);
    assumptions.push({
      id: `${factPrefix}_a1`,
      type: 'assumption',
      statement: 'There may be a website opportunity, but it cannot be assessed until the site is reachable and manually reviewed.',
      rationale: 'The audit stopped at the network layer. No conclusion about design, content or conversion is made.',
      basis: [failure.id],
      confidence: 'low'
    });
    return {
      verified: false,
      state: 'UNREACHABLE',
      website: {
        url: websiteUrl,
        finalUrl: null,
        status: null,
        verified: false,
        title: null,
        generator: null,
        bytes: null,
        elapsedMs: null,
        checkedAt,
        identityMatch: false,
        locationMatch: false,
        limitation: message
      },
      facts,
      assumptions,
      opportunitySignals: signals,
      score: 0,
      priority: 'REVIEW',
      opportunity: {
        score: 0,
        priority: 'REVIEW',
        headline: 'Website could not be reached',
        summary: 'No claims are made about this site. NOVA recorded the failure and recommends a manual browser check.',
        signals
      },
      checks: null
    };
  }

  const analysis = page.status === 200 ? analyzeHtml(page.body, page.headers) : null;
  const blocked = looksBlocked(page, analysis);
  const isHtml = /html/i.test(page.contentType ?? '');
  const verified = page.status === 200 && isHtml;

  const responseFact = fact(
    `Homepage responded HTTP ${page.status}${page.redirects?.length ? ` after ${page.redirects.length} redirect(s)` : ''} at ${page.finalUrl}.`,
    { url: page.finalUrl, method: 'Direct HTTP GET with redirect and SSRF validation' }
  );

  if (!verified) {
    const reason = blocked
      ? 'The website served a firewall or bot-challenge page, so its content could not be inspected.'
      : `The website returned ${page.contentType || 'a non-HTML response'}, so no site-quality conclusions are made.`;
    signal('Automated site audit blocked', 0, responseFact, 'Use a manual browser review; do not infer site quality from the block.', 2);
    assumptions.push({
      id: `${factPrefix}_a1`,
      type: 'assumption',
      statement: 'A website opportunity may exist, but it requires a manual review to assess.',
      rationale: blocked
        ? 'The delivered page was a firewall challenge rather than the business homepage.'
        : 'The response was not inspectable HTML.',
      basis: [responseFact.id],
      confidence: 'low'
    });
    return {
      verified: false,
      state: blocked ? 'BLOCKED' : 'NOT_HTML',
      website: {
        url: websiteUrl,
        finalUrl: page.finalUrl,
        status: page.status,
        verified: false,
        title: analysis?.title || null,
        generator: null,
        bytes: page.bytes,
        elapsedMs: page.elapsedMs,
        checkedAt,
        identityMatch: false,
        locationMatch: false,
        limitation: reason
      },
      facts,
      assumptions,
      opportunitySignals: signals,
      score: 0,
      priority: 'REVIEW',
      opportunity: {
        score: 0,
        priority: 'REVIEW',
        headline: 'Manual review required',
        summary: reason,
        signals
      },
      checks: null
    };
  }

  const tokens = nameTokens(business.name);
  const titleLower = analysis.title.toLowerCase();
  const identityMatch =
    tokens.some((token) => titleLower.includes(token)) ||
    titleLower.includes(String(business.name).toLowerCase());
  const cityToken = String(business.city ?? '').split(',')[0].trim().toLowerCase();
  const locationMatch = cityToken.length > 2 && analysis.text.toLowerCase().includes(cityToken);
  const titleFact = fact(`Homepage title: “${analysis.title || '(no title)'}”.`);
  const identityFact = fact(
    identityMatch
      ? `The homepage title contains a distinctive token from the source business name “${business.name}”.`
      : `The homepage title does not clearly match the source business name “${business.name}”.`
  );
  const descriptionFact = fact(
    analysis.description
      ? `Meta description present (${analysis.descriptionLength} characters): “${analysis.description.slice(0, 180)}”.`
      : 'No meta description is present in the delivered HTML.'
  );
  const viewportFact = fact(
    analysis.viewport
      ? 'A viewport meta tag is present, declaring a responsive layout.'
      : 'No viewport meta tag is present in the delivered HTML.'
  );
  const weightFact = fact(
    `Homepage HTML payload is ${Math.round(page.bytes / 1024)} KB and responded in ${page.elapsedMs} ms.`
  );
  const platformFact = fact(
    analysis.generator
      ? `Detected publishing platform: ${analysis.generator}.`
      : 'No common publishing platform signature was detected.'
  );
  const contactFact = fact(
    [
      analysis.email ? 'email link' : null,
      analysis.phone ? 'phone link' : null,
      analysis.hasContactForm ? 'contact form' : null,
      analysis.hasForm && !analysis.hasContactForm ? 'non-contact form' : null
    ].filter(Boolean).length
      ? `Visible contact actions detected: ${[
          analysis.email ? 'email link' : null,
          analysis.phone ? 'phone link' : null,
          analysis.hasContactForm ? 'contact form' : null,
          analysis.hasForm && !analysis.hasContactForm ? 'non-contact form' : null
        ].filter(Boolean).join(', ')}.`
      : 'No email link, phone link, or contact form was detected in the delivered HTML.'
  );
  const orderFact = fact(
    analysis.ordering
      ? 'An online ordering, shopping, or reservation call to action is present.'
      : 'No online ordering, shopping, or reservation call to action was detected in the delivered HTML.'
  );
  const menuFact = fact(
    analysis.menuLink
      ? 'A menu link is present in the homepage navigation or calls to action.'
      : 'No menu link was detected in the delivered HTML.'
  );
  const socialFact = fact(
    analysis.social.length
      ? `Social profile links detected: ${analysis.social.join(', ')}.`
      : 'No social profile links were detected in the delivered HTML.'
  );
  const schemaFact = fact(
    analysis.hasLocalBusinessSchema
      ? `Local-business structured data present (${analysis.jsonLdTypes.join(', ')}).`
      : 'No LocalBusiness-style structured data was detected in the delivered HTML.'
  );
  const hstsFact = fact(
    analysis.hsts
      ? 'Strict-Transport-Security is present with a positive max-age.'
      : 'No positive Strict-Transport-Security max-age header was observed.'
  );
  if (analysis.copyrightYear) {
    fact(`The homepage displays a ${analysis.copyrightYear} copyright year.`);
  }
  fact(
    analysis.analytics
      ? 'A web analytics or tag-manager signature is present.'
      : 'No common analytics or tag-manager signature was detected.'
  );

  if (!identityMatch) {
    signal('Homepage identity is unclear', 10, identityFact, 'Make the business name unmistakable in the title and H1.', 2);
  }
  if (!analysis.description) {
    signal('Missing meta description', 10, descriptionFact, 'Write a concise, location-specific meta description.', 2);
  }
  if (!analysis.viewport) {
    signal('No responsive viewport declaration', 18, viewportFact, 'Add a responsive viewport and test on phones.', 3);
  }
  if (page.bytes > 150_000) {
    signal('Heavy homepage payload', 10, weightFact, 'Compress images and defer non-critical scripts.', 2);
  }
  if (page.elapsedMs > 1500) {
    signal('Slow homepage response', 8, weightFact, 'Profile hosting and asset delivery.', 2);
  }
  if (!analysis.email && !analysis.phone && !analysis.hasContactForm) {
    signal('No direct contact action', 16, contactFact, 'Add a clear contact action above the fold.', 3);
  }
  if (!analysis.ordering) {
    signal('No online ordering or booking path', 8, orderFact, 'Test a simple order/reservation call to action.', 2);
  }
  if (!analysis.menuLink) {
    signal('No menu navigation link', 4, menuFact, 'Expose the menu directly in the primary navigation.', 1);
  }
  if (!analysis.hasLocalBusinessSchema) {
    signal('No local-business structured data', 5, schemaFact, 'Add LocalBusiness JSON-LD with verified details.', 1);
  }
  if (!analysis.hsts) {
    signal('HSTS header missing or zero', 4, hstsFact, 'Enable HSTS after confirming all subdomains use HTTPS.', 1);
  }
  if (analysis.copyrightYear && analysis.copyrightYear < new Date(checkedAt).getUTCFullYear() - 1) {
    const copyrightFact = facts.find((entry) => entry.statement.includes('copyright year'));
    signal('Stale copyright year', 7, copyrightFact, 'Refresh the footer and review time-sensitive content.', 2);
  }
  if (!analysis.social.length) {
    signal('No social profiles linked', 3, socialFact, 'Link active profiles so visitors can verify the business.', 1);
  }
  if (cityToken.length > 2 && !titleLower.includes(cityToken)) {
    signal('City absent from page title', 4, titleFact, 'Include the service city in the page title where natural.', 1);
  }

  signals.sort((a, b) => b.weight - a.weight);
  const score = Math.min(100, signals.reduce((total, entry) => total + entry.weight, 0));
  const priority = score >= 40 ? 'HOT' : score >= 20 ? 'WARM' : 'NURTURE';
  const top = signals.slice(0, 2);
  const opportunity = {
    headline:
      top.length === 0
        ? 'No material static-HTML gaps observed'
        : `${top.length === 1 ? 'One' : top.length} observable website gap${top.length === 1 ? '' : 's'} led by ${top[0].label.toLowerCase()}`,
    summary:
      top.length === 0
        ? 'The delivered homepage covers the basics NOVA checks. A deeper analytics and conversion review would be needed before proposing work.'
        : `${business.name} has a live, identifiable website. Observed gaps: ${top
            .map((entry) => entry.label.toLowerCase())
            .join(' and ')}. These are static-HTML observations, not measured revenue losses.`,
    signals
  };

  if (top.length) {
    assumptions.push({
      id: `${factPrefix}_a1`,
      type: 'assumption',
      statement: `Addressing “${top[0].label}” may improve how prospective customers find or contact ${business.name}.`,
      rationale:
        'This is an inference from observed HTML. No traffic, conversion, ranking or revenue data was collected, so impact is unproven.',
      basis: top.map((entry) => entry.factId),
      confidence: 'medium'
    });
  }
  assumptions.push({
    id: `${factPrefix}_a${assumptions.length + 1}`,
    type: 'assumption',
    statement: `${business.name} is a plausible fit for a website review, but budget, decision-maker and interest are unknown.`,
    rationale:
      'Fit is based only on a verified business listing and a live website. No contact, intent or commercial data was used.',
    basis: [identityFact.id, responseFact.id],
    confidence: 'low'
  });

  return {
    verified,
    state: 'VERIFIED',
    website: {
      url: websiteUrl,
      finalUrl: page.finalUrl,
      status: page.status,
      verified,
      title: analysis.title,
      generator: analysis.generator,
      bytes: page.bytes,
      elapsedMs: page.elapsedMs,
      checkedAt,
      identityMatch,
      locationMatch,
      limitation: null
    },
    facts,
    assumptions,
    opportunitySignals: signals,
    score,
    priority,
    opportunity,
    checks: {
      title: analysis.title || null,
      metaDescription: analysis.description || null,
      viewport: analysis.viewport,
      https: page.finalUrl.startsWith('https://'),
      hsts: analysis.hsts,
      social: analysis.social,
      email: analysis.email,
      phone: analysis.phone,
      contactForm: analysis.hasContactForm,
      ordering: analysis.ordering,
      menuLink: analysis.menuLink,
      structuredData: analysis.hasLocalBusinessSchema,
      analytics: analysis.analytics,
      copyrightYear: analysis.copyrightYear,
      platform: analysis.generator,
      bytes: page.bytes,
      elapsedMs: page.elapsedMs,
      identityMatch,
      locationMatch
    }
  };
}
