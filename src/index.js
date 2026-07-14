#!/usr/bin/env node
// CLI entry: parse arguments and run the shared pipeline.
import path from 'node:path';
import { normalizeStartUrl, runPipeline } from './pipeline.js';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-sitemap') args.forceCrawl = true;
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[key] = true;
      else { args[key] = next; i++; }
    } else args._.push(a);
  }
  return args;
}

function log(msg) { process.stdout.write(msg + '\n'); }

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startUrl = args._[0];
  if (!startUrl) {
    log('Usage: node src/index.js <url> [--max-pages 50] [--threshold 85] [--html-weight 0.5] [--visual-weight 0.5] [--concurrency 4] [--out ./output] [--no-sitemap] [--keep-text]');
    process.exit(1);
  }
  let normalizedStart;
  try { normalizedStart = normalizeStartUrl(startUrl); }
  catch { log(`Invalid URL: ${startUrl}`); process.exit(1); }

  const opts = {
    startUrl: normalizedStart,
    maxPages: parseInt(args['max-pages'] ?? '50', 10),
    threshold: parseInt(args.threshold ?? '85', 10),
    htmlWeight: parseFloat(args['html-weight'] ?? '0.5'),
    visualWeight: parseFloat(args['visual-weight'] ?? '0.5'),
    concurrency: parseInt(args.concurrency ?? '4', 10),
    forceCrawl: !!args.forceCrawl,
    keepText: !!args['keep-text'],
    baseOut: args.out ?? path.resolve(process.cwd(), 'output'),
  };

  log('');
  await runPipeline(opts, { log });
  log('');
}

main().catch((e) => {
  console.error('Fatal:', e.message || e);
  process.exit(1);
});
