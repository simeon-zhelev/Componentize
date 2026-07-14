// Derive a human-readable title + semantic category for a section by analyzing
// its own signals: class/id keywords, tag & role, position, and content metrics.

// Category keyword patterns, checked in order (most specific first). The haystack
// is the section's class list + id + tag, lowercased.
const KEYWORDS = [
  ['Navigation', /\b(navbar|nav-|main-nav|primary-nav|site-nav|menu-|topbar)\b|(^|-)nav(-|$)/],
  ['Header', /\b(site-header|masthead|page-header|top-header)\b|(^|[-_])header([-_]|$)/],
  ['Footer', /\b(site-footer|page-footer|colophon)\b|(^|[-_])footer([-_]|$)/],
  // E-commerce (class/id based), checked before generic content categories.
  ['Product gallery', /\b(product-gallery|woocommerce-product-gallery|product-images|product__gallery)\b/],
  ['Product listing', /\b(products|product-grid|product-list|product-loop|woocommerce-products|wc-block-grid|shop-container)\b/],
  ['Product details', /\b(single-product|product-summary|product-details|product-info|product__|entry-summary)\b/],
  ['Cart', /\b(mini-cart|cart-contents|warenkorb|basket)\b|(^|[-_])cart([-_]|$)/],
  ['Related products', /\b(related-products|upsells|cross-sells|related\.products|you-may-also)\b/],
  ['Hero', /\b(hero|jumbotron|banner|cover|intro|masthead|splash)\b/],
  ['Call to action', /\b(cta|call-to-action|get-started|getstarted|signup|sign-up|book-|booking|consult)\b/],
  ['Testimonials', /\b(testimonial|reviews?|quotes?|feedback|rating)\b/],
  ['Pricing', /\b(pricing|plans?|tier|package)\b/],
  ['FAQ', /\b(faq|accordion|questions?)\b/],
  ['Newsletter', /\b(newsletter|subscribe|mailing|opt-in)\b/],
  ['Contact', /\b(contact|get-in-touch|reach-us|kontakt)\b/],
  ['Gallery', /\b(gallery|carousel|slider|slideshow|portfolio|lightbox)\b/],
  ['Team', /\b(team|staff|members?|people|author)\b/],
  ['Statistics', /\b(stats?|counter|metrics?|numbers?|achievement)\b/],
  ['Logos / Clients', /\b(logos?|clients?|partners?|brands?|sponsors?)\b/],
  ['Blog / Posts', /\b(blog|posts?|articles?|news|feed)\b/],
  ['Features / Services', /\b(features?|services?|benefits?|offerings?|solutions?|what-we|card-grid)\b/],
  ['About', /\b(about|story|mission|values|who-we)\b/],
];

// Categories that describe structure, where a category label reads better than
// whatever heading happens to be inside.
const STRUCTURAL = new Set(['Header', 'Navigation', 'Footer', 'Cart', 'Checkout']);

// Section categories we never treat as removable pure text.
const MEANINGFUL = new Set([
  'Header', 'Navigation', 'Footer', 'Cart', 'Checkout',
  'Product listing', 'Product details', 'Product', 'Product gallery', 'Add to cart', 'Related products',
]);

// Infer the page's type from its URL path (from the sitemap). Supports common
// English and German (WooCommerce/WordPress) slugs.
export function pageTypeFromUrl(url) {
  let path = '';
  try { path = new URL(url).pathname.toLowerCase(); } catch { path = String(url || '').toLowerCase(); }
  if (path === '' || path === '/') return 'home';
  const tests = [
    ['category', /\/(product-category|produkt-kategorie|warengruppe|kategorie|category|categories|collection|collections|sortiment)\//],
    ['product', /\/(product|produkt|produkte|artikel|item|p|shop-product)\//],
    ['cart', /\/(cart|warenkorb|basket)(\/|$)/],
    ['checkout', /\/(checkout|kasse|bestellung|zur-kasse)(\/|$)/],
    ['account', /\/(my-account|account|konto|mein-konto)(\/|$)/],
    ['shop', /\/([a-z-]*shop|store|onlineshop|online-shop|laden|produkte)(\/|$)/],
    ['blog', /\/(blog|news|aktuelles|magazin|journal|posts?)(\/|$|\/)/],
    ['contact', /\/(contact|kontakt)(\/|$)/],
    ['about', /\/(about|about-us|ueber-uns|uber-uns|wir|philosophie|geschichte)(\/|$)/],
  ];
  for (const [type, re] of tests) if (re.test(path)) return type;
  return 'page';
}

// Page types that map to a section label when content is otherwise generic.
const PAGE_TYPE_LABEL = {
  product: 'Product details',
  shop: 'Product listing',
  category: 'Product listing',
  cart: 'Cart',
  checkout: 'Checkout',
  blog: 'Blog post',
  news: 'Blog post',
  contact: 'Contact',
  about: 'About',
};

function detectCategory(section) {
  const hay = [section.classes.join(' '), section.elId, section.tag].join(' ').toLowerCase();
  const m = section.metrics || {};
  const e = section.ecommerce || {};
  const pt = pageTypeFromUrl(section.page);

  // Role/tag give strong structural signals first.
  if (section.role === 'footer') return 'Footer';
  if (section.role === 'header') return section.hasNav ? 'Navigation' : 'Header';

  // E-commerce content signals (strong, content-based).
  if (e.productCards >= 3) return 'Product listing';
  if (/\b(woocommerce|products?|shop)\b/.test(hay) && (e.priceCount >= 2 || e.productCards >= 2)) return 'Product listing';
  if (e.addToCart) return pt === 'product' ? 'Product details' : 'Add to cart';
  if (/\b(warenkorb|basket)\b/.test(hay) || pt === 'cart') return 'Cart';
  if (/\b(checkout|kasse)\b/.test(hay) || pt === 'checkout') return 'Checkout';
  if (e.priceCount >= 2 && m.images >= 2) return 'Product listing';
  // A priced block on a shop/product page (e.g. the buy box) beats generic Form.
  if (e.priceCount >= 1 && (pt === 'product' || pt === 'shop' || pt === 'category')) {
    return pt === 'product' ? 'Product details' : 'Product';
  }

  for (const [label, re] of KEYWORDS) if (re.test(hay)) return label;

  // Content-based fallbacks when class names are unhelpful.
  const nearTop = (section.box?.y ?? 9999) < 120;
  const nearBottom = section.box && section.box.y > 2000; // rough: deep in the page
  if (m.forms > 0) return pt === 'product' ? 'Product details' : 'Form';
  if (section.hasNav && m.links >= 4 && m.headings === 0) return 'Navigation';
  if (nearTop && m.links >= 4 && m.headings <= 1 && m.textLen < 400) return 'Navigation';
  if (e.priceCount >= 1 && m.images >= 1) return 'Product';
  if (m.images >= 4 && m.textLen < 220) return 'Gallery';
  if (m.headings >= 3 && m.lists === 0) return 'Features / Services';
  if (nearBottom && m.links >= 6) return 'Footer';

  // Fall back to the page type (from the sitemap) for otherwise-generic content.
  if (PAGE_TYPE_LABEL[pt] && (m.headings >= 1 || m.textLen > 0)) return PAGE_TYPE_LABEL[pt];
  if (m.headings >= 1) return 'Content';
  if (m.images >= 1 && m.textLen < 80) return 'Media';
  return 'Content';
}

/**
 * @returns {{ title: string, category: string }}
 */
export function titleForSection(section) {
  const category = detectCategory(section);
  const heading = (section.heading || '').trim();
  let title;
  if (STRUCTURAL.has(category)) title = category;
  else if (heading) title = heading;
  else title = category;
  return { title, category };
}

// A "pure text" section has no images/media, forms, buttons, or prices, just
// text, and is not a meaningful structural/e-commerce section. These add no
// visual variety and are filtered out by default.
export function isPureTextSection(section) {
  const m = section.metrics || {};
  const e = section.ecommerce || {};
  const hasVisual =
    (m.images || 0) > 0 || (m.forms || 0) > 0 || (m.buttons || 0) > 0 ||
    (e.priceCount || 0) > 0 || !!e.addToCart;
  return !hasVisual && !MEANINGFUL.has(section.category) && (m.textLen || 0) > 0;
}

// Annotate every section in place with `title` and `category`.
export function titleSections(sections) {
  for (const s of sections) {
    const { title, category } = titleForSection(s);
    s.title = title;
    s.category = category;
  }
  return sections;
}
