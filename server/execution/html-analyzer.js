const ENTITY_MAP = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
};

export function decodeEntities(value = '') {
  return String(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITY_MAP[name.toLowerCase()] ?? match);
}

export function stripTags(html = '') {
  return decodeEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseAttributes(tag) {
  const attrs = {};
  const body = tag.replace(/^<\s*[\w:-]+/, '').replace(/\/?>$/, '');
  const re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match;
  while ((match = re.exec(body))) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[3] ?? match[4] ?? match[5] ?? '');
  }
  return attrs;
}

function metaTags(html) {
  return [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => parseAttributes(match[0]));
}

export function analyzeHtml(html, headers = {}) {
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? decodeEntities(titleMatch[1]).replace(/\s+/g, ' ').trim() : '';
  const metas = metaTags(html);
  const metaByName = (name) =>
    metas.find((meta) => (meta.name ?? '').toLowerCase() === name)?.content ??
    metas.find((meta) => (meta.property ?? '').toLowerCase() === name)?.content ??
    '';
  const canonical = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => parseAttributes(match[0]))
    .find((attrs) => (attrs.rel ?? '').toLowerCase() === 'canonical')?.href;

  const links = [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => ({
    attrs: parseAttributes(match[0].slice(0, match[0].indexOf('>') + 1)),
    text: stripTags(match[1])
  }));
  const hrefs = links.map((link) => link.attrs.href ?? '').filter(Boolean);
  const allHrefs = hrefs.join(' ');
  const text = stripTags(html);

  const generator =
    metaByName('generator') ||
    (/squarespace/i.test(html) ? 'Squarespace' : '') ||
    (/cdn\.shopify|shopify\.com/i.test(html) ? 'Shopify' : '') ||
    (/wp-content|wordpress/i.test(html) ? 'WordPress' : '') ||
    (/wixstatic|wix\.com/i.test(html) ? 'Wix' : '') ||
    (/webflow/i.test(html) ? 'Webflow' : '');

  const social = [];
  if (/instagram\.com/i.test(allHrefs)) social.push('Instagram');
  if (/facebook\.com/i.test(allHrefs)) social.push('Facebook');
  if (/linkedin\.com/i.test(allHrefs)) social.push('LinkedIn');
  if (/tiktok\.com/i.test(allHrefs)) social.push('TikTok');
  if (/youtube\.com|youtu\.be/i.test(allHrefs)) social.push('YouTube');
  if (/x\.com|twitter\.com/i.test(allHrefs)) social.push('X / Twitter');

  const formBlocks = [...html.matchAll(/<form\b[\s\S]*?<\/form>/gi)].map((match) => match[0]);
  const hasForm = formBlocks.length > 0;
  const hasContactForm = formBlocks.some(
    (form) =>
      /type\s*=\s*["']?email/i.test(form) ||
      /name\s*=\s*["']?(name|email|message|comments|contact)/i.test(form) ||
      /(contact|enquir|inquir)/i.test(form)
  );

  const orderingPattern =
    /order\s+(online|now|for pickup)|add\s+to\s+cart|shop\s+now|buy\s+now|book\s+(a\s+)?(table|now)|reserve|reservation|start\s+order/i;
  const ordering = orderingPattern.test(text) || orderingPattern.test(allHrefs);
  const menuLink = links.some(
    (link) => /menu/i.test(link.text) || /\/menu|menu\./i.test(link.attrs.href ?? '')
  );

  const copyrightYears = [...text.matchAll(/(?:©|copyright|&copy;)[^0-9]{0,30}(20\d{2})/gi)]
    .map((match) => Number(match[1]))
    .filter((year) => year >= 2000 && year <= 2100);
  const copyrightYear = copyrightYears.length ? Math.max(...copyrightYears) : null;

  const jsonLdTypes = [];
  for (const match of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const type of match[1].matchAll(/"@type"\s*:\s*"([^"]+)"/g)) jsonLdTypes.push(type[1]);
  }

  const phone = hrefs.some((href) => /^tel:/i.test(href));
  const email = hrefs.some((href) => /^mailto:/i.test(href));
  const addressInText = /(?:street|st\.|avenue|ave\.|boulevard|blvd|road|rd\.|drive|dr\.)\b/i.test(text);
  const viewport = metas.some((meta) => (meta.name ?? '').toLowerCase() === 'viewport');
  const description = metaByName('description');
  const hsts = /max-age\s*=\s*([1-9]\d*)/i.test(headers['strict-transport-security'] ?? '');
  const analytics =
    /googletagmanager|google-analytics|gtag\(|plausible\.io|usefathom|clarity\.ms|matomo|segment\.com/i.test(html);

  return {
    title,
    description,
    descriptionLength: description.length,
    canonical: canonical ?? null,
    viewport,
    generator: generator || null,
    social: [...new Set(social)],
    hasForm,
    hasContactForm,
    phone,
    email,
    ordering,
    menuLink,
    copyrightYear,
    jsonLdTypes: [...new Set(jsonLdTypes)],
    hasLocalBusinessSchema: jsonLdTypes.some((type) => /localbusiness|bakery|restaurant|cafe|store|foodestablishment/i.test(type)),
    hsts,
    analytics,
    addressInText,
    text,
    hrefs
  };
}
