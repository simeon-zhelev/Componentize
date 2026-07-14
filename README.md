# Componentize

Discover the components hiding in every website.

Componentize turns an existing website into a visual component inventory. It
crawls the site, breaks each page into horizontal sections, and groups sections
that look or behave alike, from navigation and footers to calls to action,
product grids, and content modules.

Instead of reviewing dozens of pages manually, teams get an interactive map of
the patterns a website already uses: what repeats, what is inconsistent, and
what is genuinely unique.

## Why Componentize?

Website redesigns often begin with an incomplete picture. Reusable patterns are
hidden across pages, one-off layouts are easy to miss, and estimates depend on
manual audits that take time and are difficult to communicate.

Componentize makes that complexity visible. Its report helps answer:

- Which sections are reused across the website?
- Where do visually similar components differ structurally?
- Which layouts are one-offs that may need special design or development work?
- Where could duplicate patterns be consolidated into a design system?
- How large and varied is the website before a redesign begins?

## Benefits for agencies and clients

| For agencies | For clients |
| --- | --- |
| Faster discovery and design audits | A clear picture of the website’s current complexity |
| Better-informed redesign estimates and project scope | More transparent budgets and recommendations |
| A practical starting point for design-system planning | Easier conversations about what should stay, change, or merge |
| Earlier detection of duplicated and inconsistent patterns | More consistent design and user experience after redesign |
| A visual artifact that aligns design, development, and strategy | Lower long-term maintenance cost through better reuse |

## Typical use cases

- Pre-redesign website audits
- Design-system discovery and component inventories
- Scoping and estimating migration or rebuild projects
- Comparing recurring sections across large marketing websites
- Finding inconsistent implementations of similar visual patterns
- Supporting client workshops with concrete visual evidence
- Tracking how much of a website is reusable versus page-specific

## Core capabilities

- Sitemap discovery with a same-origin browser-crawl fallback
- Full-page rendering in headless Chromium, including lazy-loaded content
- Structural comparison using DOM shape, tag counts, classes, and computed styles
- Visual comparison using perceptual hashes, brightness grids, and aspect ratios
- Adjustable HTML/visual weighting and similarity threshold
- Interactive, self-contained reports that work offline
- Web workspace with live crawl progress and recent-report history
- CLI for scripted and repeatable audits

Componentize is an analysis aid rather than an automatic design-system
generator. The report gives teams evidence and a shared language; designers and
developers still decide which patterns should become maintained components.

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

1. **Discover** - reads `robots.txt` and common sitemap locations, recursively
   follows sitemap indexes, and falls back to a same-origin breadth-first crawl.
2. **Extract** - renders every page, triggers lazy content, identifies full-width
   horizontal bands, and captures their DOM metadata and screenshots.
3. **Fingerprint** - builds independent structural and visual signatures for
   every retained section.
4. **Compare** - calculates pairwise HTML and visual similarity scores from
   0–100.
5. **Cluster** - joins sections whose weighted score meets the selected threshold.
6. **Report** - writes an interactive report that can re-cluster the saved scores
   instantly as its controls change.

## Output

Every run creates `output/<domain>-<timestamp>/` with:

- `index.html` - interactive Componentize report
- `data.json` - section metadata and pairwise similarity matrices
- `screenshots/` - one image for every retained section

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
