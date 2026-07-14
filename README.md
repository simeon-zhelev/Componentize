# Componentize

> Discover the components hiding in every website.

Componentize crawls a website, breaks its pages into horizontal sections, and
groups visually or structurally similar sections into reusable component
families. The result is an interactive report of recurring patterns—navigation,
footers, calls to action, product grids—and sections that are genuinely unique.

## Features

- Sitemap discovery with a same-origin browser-crawl fallback
- Full-page rendering in headless Chromium, including lazy-loaded content
- Structural comparison using DOM shape, tag counts, classes, and computed styles
- Visual comparison using perceptual hashes, brightness grids, and aspect ratios
- Adjustable HTML/visual weighting and similarity threshold
- Interactive, self-contained reports that work offline
- Web workspace with live crawl progress and recent-report history
- CLI for scripted and repeatable audits

## Quick start

Componentize requires Node.js 18 or newer and Playwright Chromium.

```bash
npm install
npx playwright install chromium
npm run serve
```

Open [http://localhost:3000](http://localhost:3000), enter a domain such as
`htmlburger.com`, and select **Analyze website**. A bare domain defaults to
HTTPS; full `http://` and `https://` URLs are also accepted.

Set a different local port when needed:

```bash
PORT=3001 npm run serve
```

## CLI

```bash
npm start -- <url> [options]
```

Example:

```bash
npm start -- htmlburger.com --max-pages 10
```

When installed as a package, the same command is available as `componentize`.

| Option | Default | Description |
| --- | --- | --- |
| `--max-pages <n>` | `50` | Maximum number of pages to crawl |
| `--threshold <0-100>` | `85` | Combined similarity needed to group sections |
| `--html-weight <0-1>` | `0.5` | Weight of structural similarity |
| `--visual-weight <0-1>` | `0.5` | Weight of visual similarity |
| `--concurrency <n>` | `4` | Number of parallel page renders |
| `--out <dir>` | `./output` | Base directory for generated reports |
| `--no-sitemap` | off | Skip sitemap discovery and use the browser crawler |
| `--keep-text` | off | Include pure-text content sections |

## How it works

1. **Discover** — reads `robots.txt` and common sitemap locations, recursively
   follows sitemap indexes, and falls back to a same-origin breadth-first crawl.
2. **Extract** — renders every page, triggers lazy content, identifies full-width
   horizontal bands, and captures their DOM metadata and screenshots.
3. **Fingerprint** — builds independent structural and visual signatures for
   every retained section.
4. **Compare** — calculates pairwise HTML and visual similarity scores from
   0–100.
5. **Cluster** — joins sections whose weighted score meets the selected threshold.
6. **Report** — writes an interactive report that can re-cluster the saved scores
   instantly as its controls change.

## Output

Every run creates `output/<domain>-<timestamp>/` with:

- `index.html` — interactive Componentize report
- `data.json` — section metadata and pairwise similarity matrices
- `screenshots/` — one image for every retained section

The `output/` directory is intentionally ignored by Git because reports can be
large and may contain content from the audited website.

## Limitations

- Section detection and semantic labels are heuristic and vary with page markup.
- Pairwise comparison uses quadratic time and storage as the section count grows.
- Authentication walls, consent dialogs, and aggressive bot protection may
  prevent complete crawls.
- Clustering is transitive: an intermediate match can connect sections that do
  not directly meet the threshold themselves.

## Responsible use

Only crawl websites you own or are authorized to analyze. Respect site terms,
robots directives, rate limits, copyright, and applicable privacy requirements.
Review generated screenshots and metadata before sharing a report publicly.

## Development

```bash
npm ci
npx playwright install chromium
npm run check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow.

## License

Componentize is available under the [MIT License](LICENSE).
