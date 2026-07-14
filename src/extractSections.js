// Render a page in headless Chromium, detect full-width horizontal "bands"
// (sections), and capture for each: outerHTML, a structural skeleton + metrics
// + key computed styles (Approach 1), and a clipped screenshot (Approach 2).
import fs from 'node:fs';
import path from 'node:path';

// This function is serialized and executed inside the page context.
// It tags each detected band with a data-band-id and returns descriptors.
function detectBandsInPage(opts) {
  const { minHeight, splitWidthRatio, leafWidthRatio, maxDepth, maxBands } = opts;
  const vw = document.documentElement.clientWidth;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const pageHeight = Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight,
    document.documentElement.offsetHeight
  );

  const isVisible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const rectOf = (el) => el.getBoundingClientRect();

  // Full-width, tall-enough element children: the candidates to split into.
  const bandChildren = (el, ratio) =>
    [...el.children].filter((c) => {
      if (c.nodeType !== 1 || !isVisible(c)) return false;
      const r = rectOf(c);
      return r.width >= vw * ratio && r.height >= minHeight;
    });

  // Recursively partition the page into leaf "bands": descend into any element
  // whose children are 2+ full-width stacked blocks (they must be real sections),
  // unwrap single full-height wrappers, and emit everything else as a leaf band.
  const leaves = [];
  const seen = new Set();

  const collect = (el, depth) => {
    if (leaves.length >= maxBands) return;
    const kids = bandChildren(el, splitWidthRatio);
    if (depth < maxDepth && kids.length >= 2) {
      for (const k of kids) collect(k, depth + 1);
      return;
    }
    if (depth < maxDepth && kids.length === 1) {
      const k = kids[0];
      // Single child that fills the parent -> a layout wrapper; unwrap it.
      if (rectOf(k).height >= rectOf(el).height * 0.9) {
        collect(k, depth + 1);
        return;
      }
    }
    const r = rectOf(el);
    if (r.width >= vw * leafWidthRatio && r.height >= minHeight && !seen.has(el)) {
      seen.add(el);
      leaves.push(el);
    }
  };

  collect(document.body, 0);

  // Include full-width fixed/sticky bars (e.g. sticky nav) not already captured.
  document.querySelectorAll('body *').forEach((el) => {
    const pos = getComputedStyle(el).position;
    if ((pos === 'fixed' || pos === 'sticky') && isVisible(el)) {
      const r = rectOf(el);
      if (
        r.width >= vw * 0.5 &&
        r.height >= minHeight &&
        !seen.has(el) &&
        !leaves.some((l) => l.contains(el) || el.contains(l))
      ) {
        seen.add(el);
        leaves.push(el);
      }
    }
  });

  // Emit in document order.
  const kept = leaves.sort((a, b) => {
    const pos = a.compareDocumentPosition(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });

  const roleOf = (el) => {
    const tag = el.tagName.toLowerCase();
    const pos = getComputedStyle(el).position;
    if (tag === 'header') return 'header';
    if (tag === 'footer') return 'footer';
    if (pos === 'fixed' || pos === 'sticky') return 'fixed';
    return 'band';
  };

  const normClass = (cls) =>
    (cls || '')
      .split(/\s+/)
      .filter(Boolean)
      .map((c) => c.replace(/\d+/g, '#'))
      .sort()
      .slice(0, 4)
      .join('.');

  // Build a depth-limited structural skeleton and collect tag counts.
  const buildSkeleton = (el, depth, counts) => {
    const tag = el.tagName ? el.tagName.toLowerCase() : 'text';
    counts[tag] = (counts[tag] || 0) + 1;
    let token = tag;
    const cp = normClass(el.getAttribute && el.getAttribute('class'));
    if (cp) token += '.' + cp;
    if (depth >= maxDepth) return token;
    const kids = [...el.children]
      .filter((c) => c.nodeType === 1)
      .slice(0, 12)
      .map((c) => buildSkeleton(c, depth + 1, counts));
    return kids.length ? `${token}(${kids.join(',')})` : token;
  };

  const results = [];
  kept.slice(0, maxBands).forEach((el, i) => {
    const r = el.getBoundingClientRect();
    el.setAttribute('data-band-id', String(i));
    const counts = {};
    const skeleton = buildSkeleton(el, 0, counts);
    const s = getComputedStyle(el);
    const text = (el.innerText || '').trim();
    const h = el.querySelector('h1,h2,h3,h4,h5,h6');
    const heading = h ? (h.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 80) : '';
    // E-commerce signals: prices, add-to-cart controls, and product-tile counts.
    const priceCount = (
      text.match(/(?:€|\$|£|chf|fr\.)\s?\d[\d'.,]*|\d[\d'.,]*\s?(?:€|\$|£|chf|fr\.|eur|usd)\b/gi) || []
    ).length;
    const addToCart =
      !!el.querySelector(
        '.add_to_cart_button, .single_add_to_cart_button, [name="add-to-cart"], [class*="add-to-cart"], [class*="addtocart"], [class*="add_to_cart"]'
      ) || /in den warenkorb|zum warenkorb|add to cart|jetzt kaufen|buy now/i.test(text);
    const productCards = el.querySelectorAll(
      'li.product, ul.products > li, .wc-block-grid__product, [class*="product-card"], [class*="product-item"], [class*="product_item"]'
    ).length;
    results.push({
      id: i,
      tag: el.tagName.toLowerCase(),
      elId: el.id || '',
      classes: (el.getAttribute('class') || '').split(/\s+/).filter(Boolean),
      role: roleOf(el),
      hasNav: el.tagName === 'NAV' || !!el.querySelector('nav'),
      heading,
      pageHeight,
      box: { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height },
      html: (el.outerHTML || '').slice(0, 200000),
      skeleton,
      tagCounts: counts,
      metrics: {
        textLen: text.length,
        nodeCount: el.querySelectorAll('*').length,
        links: el.querySelectorAll('a').length,
        images: el.querySelectorAll('img,picture,svg').length,
        headings: el.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
        buttons: el.querySelectorAll('button,.btn,[role=button]').length,
        forms: el.querySelectorAll('form,input,textarea,select').length,
        lists: el.querySelectorAll('ul,ol').length,
      },
      ecommerce: { priceCount, addToCart, productCards },
      style: {
        display: s.display,
        position: s.position,
        flexDirection: s.flexDirection,
        justifyContent: s.justifyContent,
        alignItems: s.alignItems,
        backgroundColor: s.backgroundColor,
        color: s.color,
        fontFamily: s.fontFamily,
        fontSize: s.fontSize,
        textAlign: s.textAlign,
        paddingTop: s.paddingTop,
        paddingBottom: s.paddingBottom,
      },
      textSample: text.slice(0, 120),
    });
  });
  return results;
}

// Scroll the full page so lazy content/images load, then return to top.
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let total = 0;
      const step = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        total += step;
        if (total >= document.body.scrollHeight + window.innerHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 60);
    });
  });
  await page.waitForTimeout(400);
}

const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'page';

/**
 * Extract sections from one page.
 * @returns {Promise<Array>} section objects, each with a `screenshot` path.
 */
export async function extractPageSections(context, url, { screenshotDir, pageIndex, detect = {}, log = () => {} }) {
  const options = { minHeight: 40, splitWidthRatio: 0.72, leafWidthRatio: 0.5, maxDepth: 8, maxBands: 40, ...detect };
  const page = await context.newPage();
  const sections = [];
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() =>
      page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    );
    // Kill animations/transitions for stable screenshots.
    await page.addStyleTag({
      content: `*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}`,
    }).catch(() => {});
    await autoScroll(page);

    const bands = await page.evaluate(detectBandsInPage, options);
    log(`  ${url} → ${bands.length} section(s)`);

    for (const band of bands) {
      const name = `p${pageIndex}-${slug(url.split('/').slice(3).join('-'))}-s${band.id}-${band.role}.png`;
      const shotPath = path.join(screenshotDir, name);
      let ok = false;
      try {
        const loc = page.locator(`[data-band-id="${band.id}"]`).first();
        await loc.screenshot({ path: shotPath, timeout: 15000, animations: 'disabled' });
        ok = true;
      } catch {
        // Fallback: clip screenshot using recorded box.
        try {
          await page.screenshot({
            path: shotPath,
            clip: { x: band.box.x, y: band.box.y, width: Math.max(1, band.box.width), height: Math.min(band.box.height, 4000) },
            timeout: 15000,
          });
          ok = true;
        } catch {
          ok = false;
        }
      }
      if (!ok || !fs.existsSync(shotPath)) continue;
      sections.push({
        ...band,
        page: url,
        pageIndex,
        screenshot: path.relative(path.dirname(screenshotDir), shotPath),
        screenshotAbs: shotPath,
      });
    }
  } catch (e) {
    log(`  ERROR extracting ${url}: ${e.message}`);
  } finally {
    await page.close();
  }
  return sections;
}
