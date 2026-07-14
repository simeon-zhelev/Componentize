#!/usr/bin/env node
// Zero-dependency web UI for the section crawler. Serves a form, runs the shared
// pipeline, streams progress over Server-Sent Events, and serves the generated
// reports + screenshots. Bind to localhost only (local dev tool).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { runPipeline } from './pipeline.js';

const PORT = parseInt(process.env.PORT ?? getArg('--port') ?? '3000', 10);
const BASE_OUT = path.resolve(process.cwd(), 'output');

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

// Serve a file from within BASE_OUT, guarding against path traversal.
function serveOutput(req, res, urlPath) {
  const rel = decodeURIComponent(urlPath.replace(/^\/output\/?/, ''));
  const target = path.resolve(BASE_OUT, rel);
  if (target !== BASE_OUT && !target.startsWith(BASE_OUT + path.sep)) {
    return send(res, 403, 'text/plain', 'Forbidden');
  }
  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, 'text/plain', 'Not found');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(target).pipe(res);
  });
}

// List existing runs (newest first).
function listRuns() {
  if (!fs.existsSync(BASE_OUT)) return [];
  return fs
    .readdirSync(BASE_OUT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(BASE_OUT, d.name, 'index.html')))
    .map((d) => ({ dir: d.name, url: `/output/${d.name}/index.html`, mtime: fs.statSync(path.join(BASE_OUT, d.name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
}

// SSE endpoint: run the pipeline, stream log lines, then a `done`/`failed` event.
async function runSse(req, res, query) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  const sse = (event, data) => {
    if (event) res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  const num = (v, d) => (v === null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

  const opts = {
    startUrl: query.get('url') || '',
    maxPages: num(query.get('maxPages'), 50),
    threshold: num(query.get('threshold'), 85),
    htmlWeight: num(query.get('htmlWeight'), 0.5),
    visualWeight: num(query.get('visualWeight'), 0.5),
    concurrency: num(query.get('concurrency'), 4),
    forceCrawl: query.get('forceCrawl') === '1',
    keepText: query.get('keepText') === '1',
    baseOut: BASE_OUT,
  };

  try {
    if (!opts.startUrl) throw new Error('Please enter a URL.');
    const result = await runPipeline(opts, { log: (line) => sse('log', { line }) });
    sse('done', {
      reportUrl: `/output/${result.reportDir}/index.html`,
      stats: {
        pages: result.pages,
        sections: result.sectionCount,
        source: result.source,
        groups: result.groups,
      },
    });
  } catch (e) {
    sse('failed', { message: e.message || String(e) });
  } finally {
    res.end();
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  if (req.method === 'GET' && p === '/') return send(res, 200, MIME['.html'], FORM_PAGE);
  if (req.method === 'GET' && p === '/api/run') return runSse(req, res, url.searchParams);
  if (req.method === 'GET' && p === '/api/runs') return send(res, 200, MIME['.json'], JSON.stringify(listRuns()));
  if (req.method === 'GET' && p.startsWith('/output/')) return serveOutput(req, res, p);
  return send(res, 404, 'text/plain', 'Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`\n  Componentize running at http://localhost:${PORT}\n\n`);
});

// ---------------------------------------------------------------------------
const FORM_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="color-scheme" content="light dark"/>
<title>Componentize | Website component discovery</title>
<style>
  :root {
    color-scheme:light;
    --canvas:#f5f5f2; --surface:#fff; --surface-raised:#fafaf8; --surface-muted:#efefec;
    --border:#deded8; --border-strong:#c9c9c1; --text:#242422; --muted:#6f706b;
    --accent:#6565a7; --accent-hover:#575795; --accent-soft:#eeeeF7;
    --good:#397454; --good-soft:#e9f4ed; --bad:#a44747; --bad-soft:#f8eaea;
    --shadow:0 12px 32px rgba(31,31,27,.06); --radius:10px;
  }
  @media (prefers-color-scheme:dark){
    :root {
      color-scheme:dark;
      --canvas:#171816; --surface:#1f201e; --surface-raised:#242522; --surface-muted:#2a2b28;
      --border:#363733; --border-strong:#494a45; --text:#eeeeea; --muted:#a2a39d;
      --accent:#a2a0d3; --accent-hover:#b7b5df; --accent-soft:#2d2d40;
      --good:#77b48e; --good-soft:#203128; --bad:#df8a8a; --bad-soft:#3b2525;
      --shadow:0 18px 42px rgba(0,0,0,.18);
    }
  }
  *{ box-sizing:border-box; }
  html,body{ min-height:100%; }
  body{ margin:0; font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; background:var(--canvas); color:var(--text); }
  button,input{ font:inherit; }
  a{ color:inherit; }
  :focus-visible{ outline:3px solid color-mix(in srgb,var(--accent) 38%,transparent); outline-offset:2px; }
  .appbar{ height:72px; padding:0 24px; border-bottom:1px solid var(--border); background:color-mix(in srgb,var(--surface) 94%,transparent); display:flex; align-items:center; justify-content:space-between; gap:24px; }
  .brand{ display:flex; align-items:center; gap:12px; min-width:0; }
  .brand-mark{ width:34px; height:34px; padding:7px 6px; border:1px solid var(--border-strong); border-radius:9px; display:flex; flex-direction:column; justify-content:space-between; background:var(--surface); box-shadow:0 2px 8px rgba(31,31,27,.04); }
  .brand-mark i{ display:block; height:4px; border-radius:2px; background:var(--accent); }
  .brand-mark i:nth-child(2){ width:72%; align-self:flex-end; opacity:.65; }
  .brand-copy{ min-width:0; }
  .brand-name{ font-size:16px; font-weight:680; letter-spacing:-.015em; line-height:1.2; }
  .tagline{ color:var(--muted); font-size:12px; margin-top:2px; white-space:nowrap; }
  .app-meta{ color:var(--muted); font-size:11px; letter-spacing:.08em; text-transform:uppercase; }
  main{ display:grid; grid-template-columns:356px minmax(0,1fr); min-height:calc(100vh - 72px); }
  .panel{ padding:26px 24px 32px; border-right:1px solid var(--border); background:var(--surface); overflow:auto; }
  .panel-intro{ margin-bottom:22px; }
  .eyebrow{ color:var(--accent); font-size:11px; font-weight:700; letter-spacing:.09em; text-transform:uppercase; margin-bottom:5px; }
  h1{ font-size:20px; line-height:1.25; letter-spacing:-.025em; margin:0; }
  .sub{ color:var(--muted); font-size:12px; margin-top:5px; }
  .section-label{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin:22px 0 10px; color:var(--muted); font-size:11px; font-weight:700; letter-spacing:.075em; text-transform:uppercase; }
  .section-label::after{ content:""; height:1px; flex:1; background:var(--border); }
  .field{ margin-bottom:14px; }
  .field label{ display:flex; align-items:baseline; justify-content:space-between; gap:8px; font-size:12px; font-weight:600; color:var(--text); margin-bottom:6px; }
  .field label small{ color:var(--muted); font-size:10px; font-weight:500; }
  .field input[type=text],.field input[type=number]{ width:100%; padding:9px 10px; border:1px solid var(--border-strong); border-radius:8px; background:var(--surface-raised); color:var(--text); transition:border-color .15s,box-shadow .15s,background .15s; }
  .field input[type=text]{ padding:11px 12px; font-size:14px; }
  .field input:hover{ border-color:color-mix(in srgb,var(--accent) 45%,var(--border-strong)); }
  .field input:focus{ border-color:var(--accent); box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 13%,transparent); background:var(--surface); outline:none; }
  .grid2{ display:grid; grid-template-columns:1fr 1fr; gap:0 12px; }
  .sliders{ display:grid; gap:13px; margin:2px 0 17px; }
  .range-field label{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:6px; color:var(--text); font-size:12px; font-weight:600; }
  .range-value{ min-width:38px; color:var(--accent); font-size:11px; font-weight:700; font-variant-numeric:tabular-nums; text-align:right; }
  .range-field input[type=range]{ width:100%; height:18px; margin:0; appearance:none; -webkit-appearance:none; background:transparent; cursor:pointer; accent-color:var(--accent); }
  .range-field input[type=range]::-webkit-slider-runnable-track{ height:4px; border-radius:3px; background:var(--surface-muted); border:1px solid var(--border); }
  .range-field input[type=range]::-webkit-slider-thumb{ width:15px; height:15px; margin-top:-6px; appearance:none; -webkit-appearance:none; border:2px solid var(--surface); border-radius:50%; background:var(--accent); box-shadow:0 0 0 1px var(--accent),0 2px 5px rgba(31,31,27,.14); }
  .range-field input[type=range]::-moz-range-track{ height:3px; border-radius:3px; background:var(--surface-muted); border:1px solid var(--border); }
  .range-field input[type=range]::-moz-range-thumb{ width:13px; height:13px; border:2px solid var(--surface); border-radius:50%; background:var(--accent); box-shadow:0 0 0 1px var(--accent),0 2px 5px rgba(31,31,27,.14); }
  .range-field input[type=range]:focus-visible{ outline:none; }
  .range-field input[type=range]:focus-visible::-webkit-slider-thumb{ box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 24%,transparent); }
  .range-field input[type=range]:focus-visible::-moz-range-thumb{ box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 24%,transparent); }
  .check-stack{ padding:3px 0 6px; }
  .check{ display:flex; align-items:flex-start; gap:9px; font-size:12px; color:var(--muted); padding:6px 0; cursor:pointer; }
  .check input{ width:15px; height:15px; margin:2px 0 0; accent-color:var(--accent); flex:0 0 auto; }
  .check span{ display:block; color:var(--text); font-weight:600; }
  .check small{ display:block; color:var(--muted); font-size:11px; font-weight:400; }
  button.run{ width:100%; min-height:42px; padding:10px 14px; border:1px solid transparent; border-radius:8px; background:var(--accent); color:#fff; font-weight:650; cursor:pointer; margin-top:10px; box-shadow:0 4px 12px color-mix(in srgb,var(--accent) 22%,transparent); transition:background .15s,transform .15s,box-shadow .15s; }
  button.run:hover{ background:var(--accent-hover); transform:translateY(-1px); box-shadow:0 6px 16px color-mix(in srgb,var(--accent) 28%,transparent); }
  button.run:disabled{ opacity:.65; cursor:wait; transform:none; box-shadow:none; }
  .runs{ display:flex; flex-direction:column; gap:2px; }
  .runs a{ display:flex; align-items:center; justify-content:space-between; gap:8px; min-width:0; color:var(--text); text-decoration:none; font-size:12px; padding:8px 9px; margin:0 -9px; border-radius:7px; }
  .runs a:hover{ background:var(--surface-muted); color:var(--accent); }
  .runs .run-name{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .runs .run-arrow{ color:var(--muted); }
  .result{ display:flex; flex-direction:column; min-width:0; min-height:0; background:var(--canvas); }
  .toolbar{ min-height:58px; display:flex; align-items:center; gap:18px; padding:10px 18px; border-bottom:1px solid var(--border); background:var(--surface); flex-wrap:wrap; }
  .status{ display:flex; align-items:center; gap:8px; min-width:180px; color:var(--muted); font-size:12px; }
  .status::before{ content:""; width:7px; height:7px; border-radius:50%; background:var(--border-strong); box-shadow:0 0 0 3px var(--surface-muted); }
  .status.err{ color:var(--bad); } .status.err::before{ background:var(--bad); box-shadow:0 0 0 3px var(--bad-soft); }
  .status.ok{ color:var(--good); } .status.ok::before{ background:var(--good); box-shadow:0 0 0 3px var(--good-soft); }
  .stat{ display:flex; align-items:baseline; gap:4px; padding-left:18px; border-left:1px solid var(--border); }
  .stat b{ font-size:15px; font-variant-numeric:tabular-nums; } .stat span{ color:var(--muted); font-size:11px; }
  .toolbar a{ color:var(--accent); text-decoration:none; font-size:12px; font-weight:650; margin-left:auto; }
  .toolbar a:hover{ color:var(--accent-hover); text-decoration:underline; text-underline-offset:3px; }
  .log{ margin:0; padding:12px 18px; background:var(--surface-raised); color:var(--muted); font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace; white-space:pre-wrap; max-height:154px; overflow:auto; border-bottom:1px solid var(--border); }
  .log:empty{ display:none; }
  iframe{ flex:1; width:100%; border:none; background:var(--canvas); min-height:480px; }
  @media (max-width:900px){
    .appbar{ padding:0 18px; }
    main{ grid-template-columns:310px minmax(0,1fr); }
    .panel{ padding:22px 18px 28px; }
    .tagline{ white-space:normal; }
    .toolbar{ gap:12px; }
    .stat{ padding-left:12px; }
  }
  @media (max-width:720px){
    .appbar{ height:auto; min-height:68px; padding:12px 16px; }
    .app-meta{ display:none; }
    main{ display:block; min-height:auto; }
    .panel{ border-right:0; border-bottom:1px solid var(--border); overflow:visible; }
    .result{ min-height:700px; }
    .toolbar{ position:sticky; top:0; z-index:5; }
    .toolbar a{ margin-left:0; width:100%; }
    iframe{ min-height:620px; }
  }
  @media (max-width:420px){
    .tagline{ font-size:11px; }
    .panel{ padding:20px 16px 26px; }
    .grid2{ grid-template-columns:1fr; }
    .toolbar{ padding:10px 14px; gap:10px 14px; }
    .status{ width:100%; min-width:0; }
    .stat:first-of-type{ border-left:0; padding-left:0; }
  }
  @media (prefers-reduced-motion:reduce){ *,*::before,*::after{ scroll-behavior:auto!important; transition:none!important; animation:none!important; } }
</style>
</head>
<body>
<header class="appbar">
  <div class="brand">
    <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
    <div class="brand-copy"><div class="brand-name">Componentize</div><div class="tagline">Discover the components hiding in every website.</div></div>
  </div>
  <div class="app-meta">Component discovery workspace</div>
</header>
<main>
  <form class="panel" id="form">
    <div class="panel-intro">
      <div class="eyebrow">New analysis</div>
      <h1>Map a website’s components</h1>
      <div class="sub">Crawl pages, compare sections, and surface reusable patterns.</div>
    </div>
    <div class="field">
      <label for="url">Website URL</label>
      <input type="text" id="url" placeholder="example.com or https://example.com" inputmode="url" autocapitalize="none" autocomplete="url" spellcheck="false" required/>
    </div>
    <div class="section-label">Analysis settings</div>
    <div class="grid2">
      <div class="field"><label for="maxPages">Max pages</label><input type="number" id="maxPages" value="50" min="1"/></div>
      <div class="field"><label for="concurrency">Concurrency</label><input type="number" id="concurrency" value="4" min="1" max="12"/></div>
    </div>
    <div class="sliders">
      <div class="range-field"><label for="threshold">Threshold <output class="range-value" id="thresholdValue" for="threshold">85</output></label><input type="range" id="threshold" value="85" min="0" max="100" step="1" aria-describedby="thresholdValue"/></div>
      <div class="range-field"><label for="htmlWeight">HTML weight <output class="range-value" id="htmlWeightValue" for="htmlWeight">50%</output></label><input type="range" id="htmlWeight" value="0.5" min="0" max="1" step="0.05" aria-describedby="htmlWeightValue"/></div>
      <div class="range-field"><label for="visualWeight">Visual weight <output class="range-value" id="visualWeightValue" for="visualWeight">50%</output></label><input type="range" id="visualWeight" value="0.5" min="0" max="1" step="0.05" aria-describedby="visualWeightValue"/></div>
    </div>
    <div class="check-stack">
      <label class="check"><input type="checkbox" id="forceCrawl"/><span>Force crawl<small>Ignore sitemap discovery</small></span></label>
      <label class="check"><input type="checkbox" id="keepText"/><span>Keep pure-text sections<small>Include text-only content bands</small></span></label>
    </div>
    <button class="run" id="runBtn" type="submit">Analyze website</button>
    <div class="section-label">Recent reports</div>
    <div class="runs" id="runs"></div>
  </form>
  <section class="result">
    <div class="toolbar">
      <span class="status" id="status">Enter a URL and run a crawl.</span>
      <span class="stat" id="statPages" hidden><b>0</b><span>pages</span></span>
      <span class="stat" id="statSections" hidden><b>0</b><span>sections</span></span>
      <span class="stat" id="statGroups" hidden><b>0</b><span>groups</span></span>
      <a id="openReport" href="#" target="_blank" rel="noopener" hidden>Open full report ↗</a>
    </div>
    <pre class="log" id="log"></pre>
    <iframe id="report" title="report"></iframe>
  </section>
</main>
<script>
const $ = id => document.getElementById(id);
const logEl=$('log'), statusEl=$('status'), reportEl=$('report'), runBtn=$('runBtn');
let es=null;

function setStat(id, val){ const el=$(id); el.hidden=false; el.querySelector('b').textContent=val; }
function resetStats(){ ['statPages','statSections','statGroups'].forEach(i=>$(i).hidden=true); $('openReport').hidden=true; }
function syncSliderValues(){
  $('thresholdValue').value=$('threshold').value;
  $('htmlWeightValue').value=Math.round(Number($('htmlWeight').value)*100)+'%';
  $('visualWeightValue').value=Math.round(Number($('visualWeight').value)*100)+'%';
}
['threshold','htmlWeight','visualWeight'].forEach(id=>$(id).addEventListener('input',syncSliderValues));
syncSliderValues();

async function loadRuns(){
  try{
    const runs = await (await fetch('/api/runs')).json();
    $('runs').innerHTML = runs.length ? runs.map(r=>'<a href="'+r.url+'" target="_blank" rel="noopener"><span class="run-name">'+r.dir+'</span><span class="run-arrow">↗</span></a>').join('') : '<span class="sub">No reports yet</span>';
  }catch{}
}

$('form').addEventListener('submit', e=>{
  e.preventDefault();
  if(es) es.close();
  logEl.textContent=''; resetStats();
  reportEl.removeAttribute('src');
  statusEl.className='status'; statusEl.textContent='Running…';
  runBtn.disabled=true; runBtn.textContent='Analyzing…';

  const params = new URLSearchParams({
    url: $('url').value.trim(),
    maxPages: $('maxPages').value,
    threshold: $('threshold').value,
    htmlWeight: $('htmlWeight').value,
    visualWeight: $('visualWeight').value,
    concurrency: $('concurrency').value,
    forceCrawl: $('forceCrawl').checked ? '1':'0',
    keepText: $('keepText').checked ? '1':'0',
  });

  es = new EventSource('/api/run?'+params.toString());
  es.addEventListener('log', ev=>{
    const { line } = JSON.parse(ev.data);
    logEl.textContent += line + '\\n';
    logEl.scrollTop = logEl.scrollHeight;
  });
  es.addEventListener('done', ev=>{
    const { reportUrl, stats } = JSON.parse(ev.data);
    setStat('statPages', stats.pages);
    setStat('statSections', stats.sections);
    setStat('statGroups', stats.groups.total);
    statusEl.className='status ok'; statusEl.textContent='Done ('+stats.source+')';
    const link=$('openReport'); link.href=reportUrl; link.hidden=false;
    reportEl.src = reportUrl;
    runBtn.disabled=false; runBtn.textContent='Analyze website'; es.close(); loadRuns();
  });
  es.addEventListener('failed', ev=>{
    const { message } = JSON.parse(ev.data);
    statusEl.className='status err'; statusEl.textContent='Error: '+message;
    runBtn.disabled=false; runBtn.textContent='Analyze website'; es.close();
  });
  es.onerror = ()=>{ if(runBtn.disabled){ statusEl.className='status err'; statusEl.textContent='Connection lost.'; runBtn.disabled=false; runBtn.textContent='Analyze website'; } if(es) es.close(); };
});

loadRuns();
</script>
</body>
</html>`;
