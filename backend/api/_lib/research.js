const AUTHORITATIVE_HOSTS = [
  'gov.in',
  'nic.in',
  'sebi.gov.in',
  'rbi.org.in',
  'mca.gov.in',
  'meity.gov.in',
  'labour.gov.in',
  'irdai.gov.in',
  'gst.gov.in',
  'incometaxindia.gov.in',
  'indiacode.nic.in',
  'egazette.nic.in',
  'law.cornell.edu',
  'legislation.gov.uk',
  'eur-lex.europa.eu',
  'ec.europa.eu',
  'justice.gov',
  'ftc.gov',
  'sec.gov',
  'dol.gov',
  'eeoc.gov',
  'federalregister.gov',
  'uscourts.gov',
  'barcouncilofindia.org',
  'ibbi.gov.in',
];

const DDG_URL = 'https://html.duckduckgo.com/html/';
const SEARCH_TIMEOUT_MS = Number.parseInt(process.env.LEXORIUM_SOURCES_TIMEOUT_MS || '4500', 10) || 4500;
const MAX_SOURCES = Number.parseInt(process.env.LEXORIUM_MAX_SOURCES || '4', 10) || 4;

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function stripHtml(value) {
  return clean(
    String(value || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
  );
}

function normalizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.hash = '';
    return url.toString();
  } catch (_error) {
    return '';
  }
}

function isAuthoritativeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    return AUTHORITATIVE_HOSTS.some(allowed => host === allowed || host.endsWith('.' + allowed));
  } catch (_error) {
    return false;
  }
}

function extractUrlFromDuckDuckGo(href) {
  const value = String(href || '').trim();
  if (!value) return '';
  if (value.startsWith('//')) return normalizeUrl('https:' + value);
  if (/^https?:\/\//i.test(value)) return normalizeUrl(value);
  if (value.startsWith('/l/?')) {
    try {
      const url = new URL('https://duckduckgo.com' + value);
      return normalizeUrl(url.searchParams.get('uddg') || '');
    } catch (_error) {
      return '';
    }
  }
  return '';
}

function buildSearchQuery(input, mode) {
  const compact = clean(input).slice(0, 220);
  const suffix = mode === 'research'
    ? 'official legal sources statute regulation guidance'
    : mode === 'draft'
      ? 'official contract law guidance statute'
      : mode === 'analyse'
        ? 'official legal interpretation regulation statute'
        : 'official legal compliance source';
  return `${compact} ${suffix}`.trim();
}

function parseDuckDuckGoResults(html) {
  const matches = [];
  const blockPattern = /<div class="result__body">([\s\S]*?)<\/div>\s*<\/div>/gi;
  let blockMatch;

  while ((blockMatch = blockPattern.exec(String(html || '')))) {
    const block = blockMatch[1];
    const linkMatch = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"/i);
    if (!linkMatch) continue;

    const snippetMatch =
      block.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i) ||
      block.match(/<div[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);

    const url = extractUrlFromDuckDuckGo(linkMatch[1]);
    if (!url || !isAuthoritativeUrl(url)) continue;

    matches.push({
      name: stripHtml((block.match(/<a[^>]+class="result__a"[^>]*>([\s\S]*?)<\/a>/i) || [])[1] || url),
      url,
      snippet: stripHtml((snippetMatch || [])[1] || ''),
    });
  }

  return matches;
}

async function fetchDuckDuckGo(query) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  let guardTimer = null;
  const timedOut = new Promise((resolve) => {
    guardTimer = setTimeout(() => {
      controller.abort();
      resolve([]);
    }, SEARCH_TIMEOUT_MS + 250);
  });

  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(`${DDG_URL}?q=${encodeURIComponent(query)}`, {
          headers: {
            'User-Agent': 'Lexorium/1.0 (+https://lexorium.ai)',
            Accept: 'text/html,application/xhtml+xml',
          },
          signal: controller.signal,
        });

        if (!response.ok) return [];
        const html = await response.text();
        return parseDuckDuckGoResults(html);
      })(),
      timedOut,
    ]);
  } catch (_error) {
    return [];
  } finally {
    clearTimeout(timeout);
    if (guardTimer) clearTimeout(guardTimer);
  }
}

function dedupeSources(items) {
  const seen = new Set();
  const next = [];

  for (const item of items) {
    const key = `${item.url}::${item.name}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(item);
    if (next.length >= MAX_SOURCES) break;
  }

  return next;
}

async function findAuthoritativeSources(input, mode) {
  const query = buildSearchQuery(input, mode);
  if (!query) return [];
  const sources = await fetchDuckDuckGo(query);
  return dedupeSources(sources);
}

module.exports = {
  findAuthoritativeSources,
};
