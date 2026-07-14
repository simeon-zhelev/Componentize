// Similarity scoring. Both functions return a score in [0, 100].
// - htmlSimilarity: structural (skeleton shingles + tag vector + class bag + style)
// - visualSimilarity: perceptual (dHash Hamming + coarse grid correlation + aspect)
import { hammingDistance } from './phash.js';

function jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 1 : inter / union;
}

// Cosine similarity over sparse count maps.
function cosineCounts(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const k of keys) {
    const va = a[k] || 0;
    const vb = b[k] || 0;
    dot += va * vb;
    na += va * va;
    nb += vb * vb;
  }
  if (na === 0 || nb === 0) return na === nb ? 1 : 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function styleOverlap(a, b) {
  const keys = Object.keys(a);
  if (!keys.length) return 1;
  let match = 0;
  for (const k of keys) if (a[k] === b[k]) match++;
  return match / keys.length;
}

/**
 * Structural similarity between two fingerprints -> 0..100.
 * Weighted blend: skeleton shingles (0.45), tag vector (0.2),
 * class bag (0.15), style tokens (0.2).
 */
export function htmlSimilarity(fa, fb) {
  const skel = jaccard(fa.shingles, fb.shingles);
  const tags = cosineCounts(fa.tagCounts, fb.tagCounts);
  const cls = jaccard(fa.classBag, fb.classBag);
  const style = styleOverlap(fa.styleTokens, fb.styleTokens);
  const score = 0.45 * skel + 0.2 * tags + 0.15 * cls + 0.2 * style;
  return Math.round(score * 100);
}

// Pearson-ish correlation between two equal-length brightness grids.
function gridCorrelation(a, b) {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  if (va === 0 || vb === 0) return va === vb ? 1 : 0;
  return cov / Math.sqrt(va * vb); // -1..1
}

const DHASH_BITS = 64; // 8 rows * 8 diffs

/**
 * Visual similarity between two signatures -> 0..100.
 * Blend: dHash similarity (0.6) + grid correlation (0.3) + aspect closeness (0.1).
 */
export function visualSimilarity(sa, sb) {
  if (!sa || !sb) return 0;
  const dh = 1 - hammingDistance(sa.dhash, sb.dhash) / DHASH_BITS; // 0..1
  const grid = (gridCorrelation(sa.grid, sb.grid) + 1) / 2; // map -1..1 -> 0..1
  const aspect = 1 - Math.min(1, Math.abs(Math.log((sa.aspect || 1) / (sb.aspect || 1))) / 1.5);
  const score = 0.6 * dh + 0.3 * grid + 0.1 * Math.max(0, aspect);
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}

/** Combined score from html/visual with weights (weights need not sum to 1). */
export function combinedScore(html, visual, htmlWeight = 0.5, visualWeight = 0.5) {
  const total = htmlWeight + visualWeight || 1;
  return Math.round((html * htmlWeight + visual * visualWeight) / total);
}
