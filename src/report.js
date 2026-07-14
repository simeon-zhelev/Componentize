// Generate the static HTML report + data.json. The report embeds the pairwise
// similarity matrices and re-runs union-find clustering in the browser so the
// user can retune the threshold and html/visual weights live (0..100).
import fs from 'node:fs';
import path from 'node:path';

export function writeReport(outDir, { sections, matrices, meta }) {
  // Trim section objects to what the client needs.
  const clientSections = sections.map((s) => ({
    id: s.id_global,
    page: s.page,
    role: s.role,
    title: s.title,
    category: s.category,
    tag: s.tag,
    elId: s.elId,
    classes: s.classes.slice(0, 6),
    box: s.box,
    pageHeight: s.pageHeight,
    metrics: s.metrics,
    textSample: s.textSample,
    screenshot: s.screenshot,
  }));

  const data = { meta, sections: clientSections, matrices };
  fs.writeFileSync(path.join(outDir, 'data.json'), JSON.stringify(data));

  const html = renderHtml(data);
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
}

function renderHtml(data) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="color-scheme" content="light dark"/>
<title>Componentize — ${escapeHtml(data.meta.site)}</title>
<style>
  :root { --bg:#0f1115; --panel:#171a21; --panel2:#1e222b; --border:#2a2f3a; --text:#e7e9ee; --muted:#9aa3b2; --accent:#6ea8fe; --good:#4ade80; --warn:#fbbf24; }
  @media (prefers-color-scheme: light){ :root{ --bg:#f6f7f9; --panel:#fff; --panel2:#f0f2f5; --border:#dfe3ea; --text:#1a1d23; --muted:#5c6472; --accent:#2563eb; } }
  * { box-sizing:border-box; }
  body { margin:0; font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:var(--text); }
  header.top { position:sticky; top:0; z-index:10; background:var(--panel); border-bottom:1px solid var(--border); padding:14px 20px; }
  h1 { font-size:18px; margin:0 0 2px; }
  .sub { color:var(--muted); font-size:13px; }
  .controls { display:flex; flex-wrap:wrap; gap:18px; align-items:center; margin-top:12px; }
  .ctrl { display:flex; flex-direction:column; gap:2px; min-width:180px; }
  .ctrl label { font-size:12px; color:var(--muted); display:flex; justify-content:space-between; }
  .ctrl input[type=range]{ width:220px; accent-color:var(--accent); }
  .stats { margin-left:auto; display:flex; gap:20px; }
  .stat b { font-size:20px; display:block; }
  .stat span { color:var(--muted); font-size:12px; }
  main { padding:20px; max-width:1400px; margin:0 auto; }
  h2.section-title { font-size:15px; margin:26px 0 12px; padding-bottom:6px; border-bottom:1px solid var(--border); }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:16px; }
  .card { background:var(--panel); border:1px solid var(--border); border-radius:10px; overflow:hidden; display:flex; flex-direction:column; }
  .shot { background:var(--panel2); max-height:280px; overflow:hidden; display:flex; align-items:flex-start; justify-content:center; border-bottom:1px solid var(--border); cursor:zoom-in; }
  .shot img { width:100%; height:auto; display:block; }
  .card .body { padding:10px 12px; }
  .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:6px; }
  .badge { font-size:11px; padding:2px 7px; border-radius:999px; background:var(--panel2); border:1px solid var(--border); color:var(--muted); }
  .badge.role-header{ color:var(--accent); } .badge.role-footer{ color:var(--warn); }
  .badge.cat { color:var(--accent); border-color:var(--accent); }
  .card-title { font-weight:600; font-size:14px; margin-bottom:6px; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .count { font-weight:700; }
  .scores { display:flex; gap:14px; font-size:12px; color:var(--muted); margin-top:4px; }
  .scores b { color:var(--text); }
  .pages { margin-top:8px; font-size:12px; color:var(--muted); max-height:74px; overflow:auto; }
  .pages a { color:var(--accent); text-decoration:none; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .text { font-size:12px; color:var(--muted); margin-top:6px; font-style:italic; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .empty { color:var(--muted); padding:20px; }
  details.members { margin-top:8px; }
  details.members summary { cursor:pointer; color:var(--accent); font-size:12px; }
  .thumbs { display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; }
  .thumbs img { width:70px; height:44px; object-fit:cover; object-position:top center; border:1px solid var(--border); border-radius:4px; cursor:zoom-in; }
  /* Unique-sections gallery (masonry, image-first, click to zoom) */
  .gallery { columns:340px; column-gap:16px; }
  .gitem { break-inside:avoid; margin:0 0 16px; background:var(--panel); border:1px solid var(--border); border-radius:10px; overflow:hidden; cursor:zoom-in; transition:border-color .12s,transform .12s; }
  .gitem:hover { border-color:var(--accent); transform:translateY(-2px); }
  .gitem img { width:100%; height:auto; display:block; background:var(--panel2); }
  .gcap { padding:8px 10px; font-size:12px; color:var(--muted); display:flex; flex-direction:column; gap:4px; }
  .gcap .g-title { font-weight:600; font-size:13px; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .gcap .g-meta { display:flex; justify-content:space-between; gap:8px; }
  .gcap .g-page { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .gcap b { color:var(--text); }
  .lb { position:fixed; inset:0; background:rgba(0,0,0,.88); display:none; align-items:flex-start; justify-content:center; z-index:100; overflow:auto; padding:34px; }
  .lb.open { display:flex; }
  .lb img { max-width:min(1100px,100%); height:auto; border-radius:8px; box-shadow:0 12px 48px rgba(0,0,0,.55); }
  .lb .lb-close { position:fixed; top:12px; right:24px; color:#fff; font-size:34px; line-height:1; cursor:pointer; }
  .area { margin-bottom:10px; }
  .subtitle { font-size:12px; font-weight:700; color:var(--muted); margin:18px 0 10px; text-transform:uppercase; letter-spacing:.05em; }
  .areacount { font-weight:400; }

  /* Componentize visual system */
  :root {
    color-scheme:light;
    --canvas:#f5f5f2; --surface:#fff; --surface-raised:#fafaf8; --surface-muted:#efefec;
    --border:#deded8; --border-strong:#c9c9c1; --text:#242422; --muted:#6f706b;
    --accent:#6565a7; --accent-hover:#575795; --accent-soft:#eeeef7; --accent-text:#50508c;
    --shadow:0 10px 28px rgba(31,31,27,.055); --radius:10px;
  }
  * { box-sizing:border-box; }
  html { scroll-behavior:smooth; }
  body { background:var(--canvas); color:var(--text); }
  button,input { font:inherit; }
  :focus-visible { outline:3px solid color-mix(in srgb,var(--accent) 42%,transparent); outline-offset:2px; }
  header.top { padding:0; background:color-mix(in srgb,var(--surface) 96%,transparent); border-color:var(--border); box-shadow:0 4px 16px rgba(31,31,27,.025); }
  .topline { min-height:58px; display:flex; align-items:center; justify-content:space-between; gap:20px; padding:10px 22px; }
  .brand { display:flex; align-items:center; gap:10px; min-width:0; }
  .brand-mark { width:31px; height:31px; padding:6px 5px; border:1px solid var(--border-strong); border-radius:8px; display:flex; flex-direction:column; justify-content:space-between; background:var(--surface); }
  .brand-mark i { display:block; height:3px; border-radius:2px; background:var(--accent); }
  .brand-mark i:nth-child(2) { width:72%; align-self:flex-end; opacity:.65; }
  .brand-name { font-size:15px; font-weight:680; line-height:1.1; letter-spacing:-.015em; }
  .brand-tagline { color:var(--muted); font-size:10px; margin-top:3px; }
  .report-identity { min-width:0; text-align:right; }
  h1 { color:var(--text); font-size:15px; font-weight:650; letter-spacing:-.01em; margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .sub { color:var(--muted); font-size:11px; }
  .controls { min-height:66px; gap:24px; padding:10px 22px; margin:0; border-top:1px solid var(--border); background:var(--surface-raised); }
  .ctrl { gap:5px; width:200px; min-width:0; }
  .ctrl label { color:var(--muted); font-size:10px; font-weight:650; letter-spacing:.045em; text-transform:uppercase; }
  .ctrl label span { color:var(--text); font-size:11px; font-variant-numeric:tabular-nums; }
  .ctrl input[type=range] { width:100%; height:4px; accent-color:var(--accent); cursor:pointer; }
  .stats { gap:0; }
  .stat { min-width:64px; padding:0 13px; text-align:center; border-left:1px solid var(--border); }
  .stat:first-child { border-left:0; }
  .stat b { color:var(--text); font-size:17px; line-height:1.1; font-variant-numeric:tabular-nums; }
  .stat span { color:var(--muted); font-size:9px; letter-spacing:.06em; text-transform:uppercase; }
  main { padding:10px 22px 52px; max-width:1520px; }
  .area { margin-bottom:12px; }
  h2.section-title { display:flex; align-items:baseline; gap:7px; color:var(--text); font-size:14px; letter-spacing:-.01em; margin:28px 0 12px; padding-bottom:8px; border-color:var(--border); }
  h2.section-title .sub { font-weight:400; }
  .grid { grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:14px; }
  .card { min-width:0; background:var(--surface); border-color:var(--border); border-radius:var(--radius); box-shadow:0 1px 1px rgba(31,31,27,.02); transition:border-color .15s,box-shadow .15s,transform .15s; }
  .card:hover { border-color:var(--border-strong); box-shadow:var(--shadow); transform:translateY(-1px); }
  .shot { max-height:244px; background:var(--surface-muted); border-color:var(--border); }
  .card .body { padding:11px 12px 12px; }
  .row { gap:6px; margin-bottom:7px; }
  .badge { max-width:100%; font-size:9px; line-height:1.4; padding:2px 6px; border-radius:4px; background:var(--surface-muted); border-color:var(--border); color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .badge.cat { color:var(--accent-text); background:var(--accent-soft); border-color:transparent; }
  .card-title { color:var(--text); font-size:13px; font-weight:650; margin-bottom:7px; }
  .count { margin-left:auto; font-size:11px; font-variant-numeric:tabular-nums; }
  .scores { gap:13px; color:var(--muted); font-size:10px; }
  .scores b { color:var(--text); font-variant-numeric:tabular-nums; }
  .pages { color:var(--muted); font-size:10px; max-height:62px; }
  .pages a { color:var(--accent-text); padding:1px 0; }
  .pages a:hover { text-decoration:underline; text-underline-offset:2px; }
  .text { color:var(--muted); font-size:10px; margin-top:7px; }
  .empty { color:var(--muted); font-size:12px; padding:22px; border:1px dashed var(--border-strong); border-radius:var(--radius); background:var(--surface-raised); }
  details.members { margin-top:8px; border-top:1px solid var(--border); padding-top:7px; }
  details.members summary { color:var(--accent-text); font-size:10px; font-weight:600; }
  .thumbs img { width:66px; height:42px; border-color:var(--border); border-radius:5px; }
  .gallery { columns:320px; column-gap:14px; }
  .gitem { margin-bottom:14px; background:var(--surface); border-color:var(--border); border-radius:var(--radius); box-shadow:0 1px 1px rgba(31,31,27,.02); transition:border-color .15s,transform .15s,box-shadow .15s; }
  .gitem:hover { border-color:var(--border-strong); transform:translateY(-1px); box-shadow:var(--shadow); }
  .gitem img { background:var(--surface-muted); }
  .gcap { padding:9px 11px; color:var(--muted); font-size:10px; gap:4px; border-top:1px solid var(--border); }
  .gcap .g-title { color:var(--text); font-size:12px; font-weight:650; }
  .gcap b { color:var(--text); }
  .lb { background:rgba(15,15,14,.9); padding:44px 28px; }
  .lb img { max-width:min(1160px,100%); border-radius:8px; box-shadow:0 18px 60px rgba(0,0,0,.55); }
  .lb .lb-close { position:fixed; top:12px; right:16px; width:34px; height:34px; border:1px solid rgba(255,255,255,.28); border-radius:8px; background:rgba(20,20,20,.65); color:#fff; font-size:22px; line-height:1; cursor:pointer; }
  .subtitle { display:flex; align-items:center; gap:7px; color:var(--muted); font-size:10px; letter-spacing:.075em; margin:19px 0 10px; }
  .subtitle::after { content:""; height:1px; flex:1; background:var(--border); }
  .areacount { text-transform:none; letter-spacing:0; }
  @media (prefers-color-scheme:dark) {
    :root {
      color-scheme:dark;
      --canvas:#171816; --surface:#1f201e; --surface-raised:#242522; --surface-muted:#2a2b28;
      --border:#363733; --border-strong:#494a45; --text:#eeeeea; --muted:#a2a39d;
      --accent:#a2a0d3; --accent-hover:#b7b5df; --accent-soft:#2d2d40; --accent-text:#bbb9e3;
      --shadow:0 14px 36px rgba(0,0,0,.18);
    }
  }
  @media (max-width:900px) {
    .controls { gap:16px; }
    .ctrl { flex:1 1 180px; }
    .stats { width:100%; margin-left:0; justify-content:flex-start; border-top:1px solid var(--border); padding-top:9px; }
    .stat:first-child { padding-left:0; text-align:left; }
  }
  @media (max-width:620px) {
    header.top { position:static; }
    .topline { align-items:flex-start; padding:10px 14px; }
    .brand-tagline { display:none; }
    .report-identity { max-width:58%; }
    .report-identity .sub { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .controls { padding:12px 14px; gap:13px; }
    .ctrl { width:100%; flex-basis:100%; }
    .stats { justify-content:space-between; }
    .stat { flex:1; min-width:0; padding:0 7px; }
    .stat:first-child { text-align:center; }
    main { padding:5px 14px 36px; }
    .grid { grid-template-columns:1fr; }
    .gallery { columns:1; }
    h2.section-title { align-items:flex-start; flex-wrap:wrap; }
    .lb { padding:52px 12px 24px; }
  }
  @media (prefers-reduced-motion:reduce) { *,*::before,*::after { scroll-behavior:auto!important; transition:none!important; animation:none!important; } }
</style>
</head>
<body>
<header class="top">
  <div class="topline">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
      <div><div class="brand-name">Componentize</div><div class="brand-tagline">Discover the components hiding in every website.</div></div>
    </div>
    <div class="report-identity">
      <h1>${escapeHtml(data.meta.site)}</h1>
      <div class="sub">${data.meta.pages} page(s) via ${escapeHtml(data.meta.source)} · ${data.sections.length} sections · ${escapeHtml(data.meta.generatedAt)}</div>
    </div>
  </div>
  <div class="controls">
    <div class="ctrl">
      <label for="threshold">Similarity threshold <span id="thVal"></span></label>
      <input type="range" id="threshold" min="0" max="100" step="1"/>
    </div>
    <div class="ctrl">
      <label for="hw">HTML weight <span id="hwVal"></span></label>
      <input type="range" id="hw" min="0" max="100" step="5"/>
    </div>
    <div class="ctrl">
      <label for="vw">Visual weight <span id="vwVal"></span></label>
      <input type="range" id="vw" min="0" max="100" step="5"/>
    </div>
    <div class="stats">
      <div class="stat"><b id="statTop">0</b><span>top</span></div>
      <div class="stat"><b id="statBottom">0</b><span>bottom</span></div>
      <div class="stat"><b id="statContent">0</b><span>content</span></div>
      <div class="stat"><b id="statGroups">0</b><span>groups</span></div>
    </div>
  </div>
</header>
<main>
  <section class="area">
    <h2 class="section-title">Top area <span class="sub">header · navigation · top bar</span> <span class="sub areacount" id="topCount"></span></h2>
    <div class="grid" id="top"></div>
  </section>
  <section class="area">
    <h2 class="section-title">Bottom area <span class="sub">footer · CTA · copyright · bottom menu</span> <span class="sub areacount" id="bottomCount"></span></h2>
    <div class="grid" id="bottom"></div>
  </section>
  <section class="area">
    <h2 class="section-title">Content area <span class="sub areacount" id="contentCount"></span></h2>
    <h3 class="subtitle">Repeated <span class="sub areacount" id="repCount"></span></h3>
    <div class="grid" id="contentRep"></div>
    <h3 class="subtitle">Unique <span class="sub areacount" id="uniqCount"></span></h3>
    <div class="gallery" id="contentUniq"></div>
  </section>
</main>
<div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="Section screenshot" aria-hidden="true"><button class="lb-close" type="button" aria-label="Close screenshot">×</button><img src="" alt="Full section screenshot"/></div>
<script>
const DATA = ${json};
const M = DATA.matrices, S = DATA.sections, N = S.length;

function combined(i,j,hw,vw){ const t=hw+vw||1; return Math.round((M.html[i][j]*hw + M.visual[i][j]*vw)/t); }

function cluster(threshold, hw, vw){
  const parent = Array.from({length:N},(_,i)=>i);
  const find=x=>{ while(parent[x]!==x){ parent[x]=parent[parent[x]]; x=parent[x]; } return x; };
  const union=(a,b)=>{ const ra=find(a),rb=find(b); if(ra!==rb) parent[ra]=rb; };
  for(let i=0;i<N;i++) for(let j=i+1;j<N;j++) if(combined(i,j,hw,vw)>=threshold) union(i,j);
  const map=new Map();
  for(let i=0;i<N;i++){ const r=find(i); if(!map.has(r)) map.set(r,[]); map.get(r).push(i); }
  return [...map.values()].sort((a,b)=> b.length-a.length || a[0]-b[0]);
}

function avgScores(members){
  if(members.length<2) return {html:100, visual:100};
  let h=0,v=0,c=0;
  for(let i=0;i<members.length;i++) for(let j=i+1;j<members.length;j++){ h+=M.html[members[i]][members[j]]; v+=M.visual[members[i]][members[j]]; c++; }
  return { html:Math.round(h/c), visual:Math.round(v/c) };
}

function esc(s){ return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function short(u){ try{ const x=new URL(u); return x.pathname+x.search || '/'; }catch{ return u; } }

function card(group){
  const rep = S[group[0]];
  const sc = avgScores(group);
  const pages = [...new Set(group.map(i=>S[i].page))];
  const thumbs = group.slice(0,8).map(i=>'<img loading="lazy" src="'+esc(S[i].screenshot)+'" title="'+esc(short(S[i].page))+'" alt="Section from '+esc(short(S[i].page))+'" tabindex="0" role="button"/>').join('');
  return \`<div class="card">
    <div class="shot" tabindex="0" role="button" aria-label="Enlarge \${esc(rep.title)} screenshot"><img loading="lazy" src="\${esc(rep.screenshot)}" alt="Screenshot of \${esc(rep.title)}"/></div>
    <div class="body">
      <div class="card-title" title="\${esc(rep.title)}">\${esc(rep.title)}</div>
      <div class="row">
        <span class="badge cat">\${esc(rep.category)}</span>
        <span class="badge">&lt;\${esc(rep.tag)}\${rep.elId?' #'+esc(rep.elId):''}&gt;</span>
        <span class="count">×\${group.length}</span>
      </div>
      <div class="scores"><span>HTML <b>\${sc.html}</b></span><span>Visual <b>\${sc.visual}</b></span></div>
      \${rep.textSample?'<div class="text">"'+esc(rep.textSample)+'"</div>':''}
      <div class="pages">\${pages.map(p=>'<a href="'+esc(p)+'" target="_blank">'+esc(short(p))+'</a>').join('')}</div>
      \${group.length>1?'<details class="members"><summary>'+group.length+' instances</summary><div class="thumbs">'+thumbs+'</div></details>':''}
    </div>
  </div>\`;
}

// Highest combined similarity of a section to any other section (how "unique").
function nearest(idx, hw, vw){
  let best=0;
  for(let j=0;j<N;j++){ if(j===idx) continue; const c=combined(idx,j,hw,vw); if(c>best) best=c; }
  return best;
}

// Image-first gallery tile for a unique (singleton) section.
function galleryItem(group, hw, vw){
  const s=S[group[0]];
  const nm=nearest(group[0],hw,vw);
  return \`<figure class="gitem" data-full="\${esc(s.screenshot)}" tabindex="0" role="button" aria-label="Enlarge \${esc(s.title)} screenshot">
    <img loading="lazy" src="\${esc(s.screenshot)}" alt="Screenshot of \${esc(s.title)}"/>
    <figcaption class="gcap">
      <div class="g-title" title="\${esc(s.title)}">\${esc(s.title)}</div>
      <div class="g-meta"><span class="g-page">\${esc(short(s.page))}</span><span>\${esc(s.category)} · nearest <b>\${nm}</b></span></div>
    </figcaption>
  </figure>\`;
}

// Position analysis: find which section is topmost / bottommost on each page
// (static — does not depend on the threshold).
const firstOnPage={}, lastOnPage={};
(function(){
  const byPage={};
  for(let i=0;i<N;i++){ (byPage[S[i].page]=byPage[S[i].page]||[]).push(i); }
  for(const p in byPage){
    const arr=byPage[p].slice().sort((a,b)=> S[a].box.y - S[b].box.y);
    firstOnPage[arr[0]]=true; lastOnPage[arr[arr.length-1]]=true;
  }
})();

const relTopOf=i=>{ const s=S[i]; return s.box.y/(s.pageHeight||1); };
const relBottomOf=i=>{ const s=S[i]; const H=s.pageHeight||(s.box.y+s.box.height)||1; return (s.box.y+s.box.height)/H; };
// A section is "top" only if it actually sits in the upper part of the page:
// a nav/header/menu located lower down is footer navigation, not a top bar.
const isTopish=i=>{
  const s=S[i];
  if(s.role==='footer'||relTopOf(i)>=0.5||lastOnPage[i]) return false;
  return s.role==='header'||s.role==='fixed'||s.category==='Navigation'||s.category==='Header'||(firstOnPage[i]&&relTopOf(i)<0.15);
};
const isFooterish=i=>{
  const s=S[i];
  if(s.role==='footer'||s.category==='Footer') return true;
  // A nav/menu/header-like block in the lower half of the page = footer navigation.
  if((s.category==='Navigation'||s.category==='Header')&&relTopOf(i)>=0.5) return true;
  return false;
};
function median(arr){ if(!arr.length) return 0; const a=arr.slice().sort((x,y)=>x-y); const m=Math.floor(a.length/2); return a.length%2?a[m]:(a[m-1]+a[m])/2; }

// Classify a whole group (cluster) into top / bottom / content. Position is the
// primary signal; recurrence separates repeated footer chrome (CTA, copyright,
// bottom menu) from one-off page content that merely sits near the bottom.
function groupArea(members){
  const topVotes=members.filter(isTopish).length;
  const bottomVotes=members.filter(isFooterish).length;
  if(topVotes>bottomVotes && topVotes*2>=members.length) return 'top';
  if(bottomVotes>0) return 'bottom';
  const medRB=median(members.map(relBottomOf));
  const recurring=members.length>1;               // appears on multiple pages
  if(recurring && medRB>0.8) return 'bottom';      // repeated & near the bottom
  if(members.every(i=>lastOnPage[i])) return 'bottom';
  if(!recurring && medRB>0.92) return 'bottom';    // a one-off strip at the very end
  return 'content';
}

function fill(id, groups, renderer, emptyMsg){
  document.getElementById(id).innerHTML = groups.length ? groups.map(renderer).join('') : '<div class="empty">'+emptyMsg+'</div>';
}

function render(){
  const th=+document.getElementById('threshold').value;
  const hw=+document.getElementById('hw').value;
  const vw=+document.getElementById('vw').value;
  document.getElementById('thVal').textContent=th;
  document.getElementById('hwVal').textContent=hw+'%';
  document.getElementById('vwVal').textContent=vw+'%';
  const groups=cluster(th,hw,vw);

  const top=[], bottom=[], contentRep=[], contentUniq=[];
  for(const g of groups){
    const area=groupArea(g);
    if(area==='top') top.push(g);
    else if(area==='bottom') bottom.push(g);
    else if(g.length>1) contentRep.push(g);
    else contentUniq.push(g);
  }

  document.getElementById('statTop').textContent=top.length;
  document.getElementById('statBottom').textContent=bottom.length;
  document.getElementById('statContent').textContent=contentRep.length+contentUniq.length;
  document.getElementById('statGroups').textContent=groups.length;
  document.getElementById('topCount').textContent=top.length?'('+top.length+')':'';
  document.getElementById('bottomCount').textContent=bottom.length?'('+bottom.length+')':'';
  document.getElementById('contentCount').textContent=(contentRep.length+contentUniq.length)?'('+(contentRep.length+contentUniq.length)+')':'';
  document.getElementById('repCount').textContent=contentRep.length?'('+contentRep.length+' · appear on multiple pages)':'';
  document.getElementById('uniqCount').textContent=contentUniq.length?'('+contentUniq.length+' · one-off · click to zoom)':'';

  const cardFn=g=>card(g);
  fill('top', top, cardFn, 'No top-area sections at this threshold.');
  fill('bottom', bottom, cardFn, 'No bottom-area sections at this threshold.');
  fill('contentRep', contentRep, cardFn, 'No repeated content sections at this threshold.');
  fill('contentUniq', contentUniq, g=>galleryItem(g,hw,vw), 'No unique content sections at this threshold.');
}

const thEl=document.getElementById('threshold'), hwEl=document.getElementById('hw'), vwEl=document.getElementById('vw');
thEl.value=DATA.meta.threshold; hwEl.value=Math.round(DATA.meta.htmlWeight*100); vwEl.value=Math.round(DATA.meta.visualWeight*100);
[thEl,hwEl,vwEl].forEach(e=>e.addEventListener('input',render));

// Lightbox: click any section image (recurring representative, instance
// thumbnail, or unique-gallery tile) to view the full-size screenshot.
const lb=document.getElementById('lb'), lbImg=lb.querySelector('img'), lbClose=lb.querySelector('.lb-close');
let lastLbTrigger=null;
function openLb(img,trigger){ lastLbTrigger=trigger; lbImg.src=img.currentSrc||img.src; lb.classList.add('open'); lb.setAttribute('aria-hidden','false'); lbClose.focus(); }
function closeLb(){ if(!lb.classList.contains('open')) return; lb.classList.remove('open'); lb.setAttribute('aria-hidden','true'); lbImg.src=''; if(lastLbTrigger) lastLbTrigger.focus(); }
document.addEventListener('click',e=>{
  const img=e.target.closest('.shot img, .thumbs img, .gitem img');
  if(!img) return;
  openLb(img,e.target.closest('.shot, .thumbs img, .gitem'));
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape') closeLb();
  if((e.key==='Enter'||e.key===' ')&&!lb.classList.contains('open')){
    const trigger=e.target.closest('.shot, .thumbs img, .gitem');
    if(trigger){ e.preventDefault(); const img=trigger.matches('img')?trigger:trigger.querySelector('img'); if(img) openLb(img,trigger); }
  }
});
lb.addEventListener('click',e=>{ if(e.target===lb||e.target.closest('.lb-close')) closeLb(); });

render();
</script>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
