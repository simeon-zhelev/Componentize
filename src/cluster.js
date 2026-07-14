// Union-find clustering of sections by a combined similarity threshold.
import { combinedScore } from './similarity.js';

class UnionFind {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x) {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[ra] = rb;
  }
}

/**
 * Compute pairwise html/visual matrices for all sections.
 * @returns {{ html: number[][], visual: number[][] }}
 */
export function buildMatrices(sections, htmlSim, visualSim) {
  const n = sections.length;
  const html = Array.from({ length: n }, () => new Array(n).fill(0));
  const visual = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    html[i][i] = 100;
    visual[i][i] = 100;
    for (let j = i + 1; j < n; j++) {
      const h = htmlSim(sections[i].fp, sections[j].fp);
      const v = visualSim(sections[i].sig, sections[j].sig);
      html[i][j] = html[j][i] = h;
      visual[i][j] = visual[j][i] = v;
    }
  }
  return { html, visual };
}

/**
 * Group sections whose combined score >= threshold.
 * @returns {Array<{members:number[]}>} groups (arrays of section indices)
 */
export function clusterSections(sections, matrices, { threshold, htmlWeight, visualWeight }) {
  const n = sections.length;
  const uf = new UnionFind(n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const c = combinedScore(matrices.html[i][j], matrices.visual[i][j], htmlWeight, visualWeight);
      if (c >= threshold) uf.union(i, j);
    }
  }
  const groupsMap = new Map();
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    if (!groupsMap.has(root)) groupsMap.set(root, []);
    groupsMap.get(root).push(i);
  }
  // Sort: larger groups first, then by first appearance.
  return [...groupsMap.values()]
    .map((members) => ({ members: members.sort((a, b) => a - b) }))
    .sort((a, b) => b.members.length - a.members.length || a.members[0] - b.members[0]);
}
