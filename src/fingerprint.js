// Build a structural fingerprint (Approach 1) from the raw band data captured
// in the page: a set of "shingles" over the DOM skeleton, a tag-count vector,
// a class-token bag, and a small computed-style vector.

// Break the skeleton string into overlapping token shingles for Jaccard.
function shingles(skeleton, size = 2) {
  const tokens = skeleton.split(/[(),]+/).filter(Boolean);
  const out = new Set();
  if (tokens.length < size) {
    tokens.forEach((t) => out.add(t));
    return out;
  }
  for (let i = 0; i <= tokens.length - size; i++) {
    out.add(tokens.slice(i, i + size).join('>'));
  }
  return out;
}

// Normalize a color string to a coarse bucket so near-identical colors match.
function colorBucket(c) {
  const m = (c || '').match(/rgba?\(([^)]+)\)/);
  if (!m) return c || 'none';
  const [r, g, b, a = '1'] = m[1].split(',').map((s) => parseFloat(s.trim()));
  if (parseFloat(a) === 0) return 'transparent';
  const q = (v) => Math.round(v / 32); // 8 buckets per channel
  return `${q(r)},${q(g)},${q(b)}`;
}

export function buildFingerprint(band) {
  const styleTokens = {
    display: band.style.display,
    position: band.style.position,
    flexDir: band.style.flexDirection,
    justify: band.style.justifyContent,
    align: band.style.alignItems,
    textAlign: band.style.textAlign,
    bg: colorBucket(band.style.backgroundColor),
    fg: colorBucket(band.style.color),
    font: (band.style.fontFamily || '').split(',')[0].replace(/["']/g, '').trim().toLowerCase(),
  };

  const classBag = new Set(
    band.classes.map((c) => c.replace(/\d+/g, '#').toLowerCase()).filter((c) => c.length > 1)
  );

  return {
    shingles: shingles(band.skeleton),
    tagCounts: band.tagCounts || {},
    classBag,
    styleTokens,
    metrics: band.metrics || {},
    role: band.role,
  };
}

// Attach a fingerprint to every section in place.
export function fingerprintSections(sections) {
  for (const s of sections) s.fp = buildFingerprint(s);
  return sections;
}
