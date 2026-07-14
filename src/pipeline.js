// Core pipeline shared by the CLI (src/index.js) and the web server (src/server.js).
// Crawls a site, extracts page sections (structural + visual), clusters them,
// and writes the interactive HTML report. Throws on failure (callers decide how
// to surface errors); never calls process.exit.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { discoverUrls } from './crawl.js';
import { extractPageSections } from './extractSections.js';
import { fingerprintSections } from './fingerprint.js';
import { titleSections, isPureTextSection } from './title.js';
import { computeSignature } from './phash.js';
import { htmlSimilarity, visualSimilarity } from './similarity.js';
import { buildMatrices, clusterSections } from './cluster.js';
import { writeReport } from './report.js';

// Accept a full HTTP(S) URL or a bare domain/path. Bare inputs default to HTTPS
// so the same user-friendly format works in both the web UI and CLI.
export function normalizeStartUrl(input) {
  const original = String(input ?? '').trim();
  if (!original) throw new Error('Please enter a website URL.');

  let candidate = original;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(candidate);
  if (hasScheme && !/^https?:\/\//i.test(candidate)) {
    throw new Error(`Invalid website URL: ${original}. Only HTTP and HTTPS URLs are supported.`);
  }
  if (!hasScheme) candidate = `https://${candidate.replace(/^\/\//, '')}`;

  try {
    const url = new URL(candidate);
    if (!url.hostname || !['http:', 'https:'].includes(url.protocol)) throw new Error();
    return url.toString();
  } catch {
    throw new Error(`Invalid website URL: ${original}. Enter a domain such as example.com or a full URL.`);
  }
}

// Bounded-concurrency map: run `worker` over `items`, at most `concurrency` at once.
export async function runPool(items, concurrency, worker) {
  const results = [];
  let idx = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const cur = idx++;
      results[cur] = await worker(items[cur], cur);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Run the full crawl → extract → cluster → report pipeline.
 * @param {object} opts
 *   startUrl        normalized URL string
 *   maxPages, threshold, htmlWeight, visualWeight, concurrency (numbers)
 *   forceCrawl, keepText (booleans)
 *   baseOut         base output directory
 * @param {{log?: (msg:string)=>void}} hooks
 * @returns {Promise<object>} { outDir, reportPath, reportDir, source, pages, sectionCount, groups }
 */
export async function runPipeline(opts, { log = () => {} } = {}) {
  const {
    startUrl,
    maxPages = 50,
    threshold = 85,
    htmlWeight = 0.5,
    visualWeight = 0.5,
    concurrency = 4,
    forceCrawl = false,
    keepText = false,
    baseOut = path.resolve(process.cwd(), 'output'),
  } = opts;

  const normalizedStart = normalizeStartUrl(startUrl);

  const host = new URL(normalizedStart).hostname.replace(/^www\./, '');
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportDir = `${host}-${ts}`;
  const outDir = path.join(baseOut, reportDir);
  const screenshotDir = path.join(outDir, 'screenshots');
  fs.mkdirSync(screenshotDir, { recursive: true });

  log(`▶ Target: ${normalizedStart}`);
  log(`  Output: ${outDir}`);
  log(`  Options: maxPages=${maxPages} threshold=${threshold} htmlWeight=${htmlWeight} visualWeight=${visualWeight} concurrency=${concurrency}`);

  const browser = await chromium.launch({ headless: true });
  try {
    // 1) Discover URLs.
    const { urls, source } = await discoverUrls(normalizedStart, { maxPages, forceCrawl, browser, log });
    if (!urls.length) throw new Error('No pages discovered.');
    log(`Processing ${urls.length} page(s) [source: ${source}]…`);

    // 2) Extract sections from each page.
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      userAgent: 'Mozilla/5.0 (compatible; SectionCrawler/1.0)',
    });
    const perPage = await runPool(urls, concurrency, (url, i) =>
      extractPageSections(context, url, { screenshotDir, pageIndex: i, log })
    );
    await context.close();

    let sections = perPage.flat();
    log(`Extracted ${sections.length} sections total.`);

    // Titles/categories first so we can filter pure-text sections.
    titleSections(sections);
    if (!keepText) {
      const before = sections.length;
      const dropped = sections.filter((s) => isPureTextSection(s));
      sections = sections.filter((s) => !isPureTextSection(s));
      for (const s of dropped) fs.rmSync(s.screenshotAbs, { force: true });
      log(`Ignored ${before - sections.length} pure-text content section(s).`);
    }
    sections.forEach((s, i) => { s.id_global = i; s.id = i; });
    if (!sections.length) throw new Error('No sections detected.');

    // 3) Fingerprints (Approach 1) + visual signatures (Approach 2).
    fingerprintSections(sections);
    log('Computing visual signatures…');
    await runPool(sections, 8, async (s) => {
      try { s.sig = await computeSignature(s.screenshotAbs); }
      catch { s.sig = null; }
    });

    // 4) Pairwise similarity matrices.
    log('Scoring similarity (HTML + visual)…');
    const matrices = buildMatrices(sections, htmlSimilarity, visualSimilarity);

    // 5) Cluster (summary; the report re-clusters live).
    const groups = clusterSections(sections, matrices, { threshold, htmlWeight, visualWeight });
    const recurring = groups.filter((g) => g.members.length > 1).length;
    const unique = groups.filter((g) => g.members.length === 1).length;
    log(`Summary @ threshold ${threshold}: ${groups.length} groups (${recurring} recurring, ${unique} unique).`);

    // 6) Report.
    const meta = {
      site: host,
      startUrl: normalizedStart,
      source,
      pages: urls.length,
      threshold,
      htmlWeight,
      visualWeight,
      generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    };
    writeReport(outDir, { sections, matrices, meta });
    const reportPath = path.join(outDir, 'index.html');
    log(`✔ Report written: ${reportPath}`);

    return {
      outDir,
      reportDir,
      reportPath,
      source,
      pages: urls.length,
      sectionCount: sections.length,
      groups: { total: groups.length, recurring, unique },
    };
  } finally {
    await browser.close();
  }
}
