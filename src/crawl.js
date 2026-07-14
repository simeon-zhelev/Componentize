// URL discovery: try sitemaps first (robots.txt, sitemap.xml, wp-sitemap.xml),
// following sitemap-index files recursively. Fall back to a Playwright BFS crawl.
import { XMLParser } from 'fast-xml-parser';

const xml = new XMLParser({ ignoreAttributes: false, isArray: (name) => name === 'sitemap' || name === 'url' });

// Assets we never treat as crawlable HTML pages.
const NON_HTML = /\.(pdf|zip|rar|7z|gz|tar|png|jpe?g|gif|webp|svg|avif|ico|mp4|webm|mov|mp3|wav|css|js|json|xml|txt|woff2?|ttf|eot|dmg|exe|csv|docx?|xlsx?|pptx?)(\?.*)?$/i;

function sameOrigin(a, b) {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

// Normalize a URL for dedupe: drop hash, drop trailing slash (except root), sort nothing.
export function normalizeUrl(raw, base) {
  let u;
  try {
    u = new URL(raw, base);
  } catch {
    return null;
  }
  u.hash = '';
  // Strip common tracking params to reduce duplicates.
  for (const p of [...u.searchParams.keys()]) {
    if (/^utm_|^fbclid$|^gclid$/i.test(p)) u.searchParams.delete(p);
  }
  let s = u.toString();
  if (u.pathname !== '/' && s.endsWith('/')) s = s.slice(0, -1);
  return s;
}

async function fetchText(url, timeout = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SectionCrawler/1.0)' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Parse one sitemap document. Returns { pages: [...], sitemaps: [...] }.
function parseSitemap(text) {
  const pages = [];
  const sitemaps = [];
  let doc;
  try {
    doc = xml.parse(text);
  } catch {
    return { pages, sitemaps };
  }
  if (doc.sitemapindex && doc.sitemapindex.sitemap) {
    for (const s of doc.sitemapindex.sitemap) {
      if (s.loc) sitemaps.push(String(s.loc).trim());
    }
  }
  if (doc.urlset && doc.urlset.url) {
    for (const u of doc.urlset.url) {
      if (u.loc) pages.push(String(u.loc).trim());
    }
  }
  return { pages, sitemaps };
}

// Discover candidate sitemap URLs from robots.txt plus common defaults.
async function discoverSitemapUrls(startUrl) {
  const origin = new URL(startUrl).origin;
  const found = new Set();
  const robots = await fetchText(`${origin}/robots.txt`);
  if (robots) {
    for (const line of robots.split('\n')) {
      const m = line.match(/^\s*sitemap:\s*(\S+)/i);
      if (m) found.add(m[1].trim());
    }
  }
  found.add(`${origin}/sitemap.xml`);
  found.add(`${origin}/sitemap_index.xml`);
  found.add(`${origin}/wp-sitemap.xml`);
  return [...found];
}

// Crawl sitemaps recursively (bounded), collecting same-origin page URLs.
async function collectFromSitemaps(startUrl, maxPages) {
  const queue = await discoverSitemapUrls(startUrl);
  const visited = new Set();
  const pages = new Set();
  let processed = 0;

  while (queue.length && processed < 50) {
    const sm = queue.shift();
    if (visited.has(sm)) continue;
    visited.add(sm);
    const text = await fetchText(sm);
    if (!text) continue;
    processed++;
    const { pages: p, sitemaps: s } = parseSitemap(text);
    for (const pg of p) {
      const n = normalizeUrl(pg, startUrl);
      if (n && sameOrigin(n, startUrl) && !NON_HTML.test(n)) pages.add(n);
    }
    for (const child of s) {
      if (sameOrigin(child, startUrl) && !visited.has(child)) queue.push(child);
    }
  }
  return [...pages].slice(0, maxPages);
}

// BFS crawl with Playwright: render each page, extract same-origin links.
async function bfsCrawl(startUrl, maxPages, browser, log) {
  const start = normalizeUrl(startUrl, startUrl);
  const queue = [start];
  const seen = new Set([start]);
  const pages = [];
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (compatible; SectionCrawler/1.0)' });

  while (queue.length && pages.length < maxPages) {
    const url = queue.shift();
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      pages.push(url);
      log(`  crawled (${pages.length}/${maxPages}): ${url}`);
      const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')));
      for (const href of hrefs) {
        if (!href) continue;
        const n = normalizeUrl(href, url);
        if (!n || !sameOrigin(n, start) || NON_HTML.test(n) || seen.has(n)) continue;
        seen.add(n);
        queue.push(n);
      }
    } catch (e) {
      log(`  skip (load error): ${url} — ${e.message}`);
    } finally {
      await page.close();
    }
  }
  await context.close();
  return pages;
}

/**
 * Discover page URLs for a site.
 * @param {string} startUrl
 * @param {object} opts { maxPages, forceCrawl, browser, log }
 * @returns {Promise<{urls: string[], source: 'sitemap'|'crawl'}>}
 */
export async function discoverUrls(startUrl, { maxPages = 50, forceCrawl = false, browser, log = () => {} } = {}) {
  if (!forceCrawl) {
    log('Looking for a sitemap…');
    const fromSitemap = await collectFromSitemaps(startUrl, maxPages);
    if (fromSitemap.length) {
      log(`Sitemap found: ${fromSitemap.length} page URL(s).`);
      // Ensure the start URL is included.
      const start = normalizeUrl(startUrl, startUrl);
      if (start && !fromSitemap.includes(start) && fromSitemap.length < maxPages) fromSitemap.unshift(start);
      return { urls: fromSitemap.slice(0, maxPages), source: 'sitemap' };
    }
    log('No usable sitemap. Falling back to BFS crawl.');
  } else {
    log('Sitemap skipped (--no-sitemap). Using BFS crawl.');
  }
  if (!browser) throw new Error('BFS crawl requires a Playwright browser instance.');
  const urls = await bfsCrawl(startUrl, maxPages, browser, log);
  return { urls, source: 'crawl' };
}
