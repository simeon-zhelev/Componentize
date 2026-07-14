# Contributing to Componentize

Thanks for helping improve Componentize.

## Development setup

1. Install Node.js 18 or newer.
2. Run `npm ci`.
3. Run `npx playwright install chromium`.
4. Start the workspace with `npm run serve`.

Use a small `--max-pages` value when testing crawls locally. Generated reports
belong in `output/` and should not be committed.

## Before opening a pull request

- Keep changes focused and dependency-free unless a new dependency is essential.
- Preserve the CLI and web UI behavior when changing the shared pipeline.
- Run `npm run check`.
- Exercise the affected flow with a small site crawl when behavior changes.
- Do not include third-party screenshots, crawl output, credentials, or personal
  data in commits.

Pull requests should explain the problem, the chosen approach, and the checks
performed. Screenshots are welcome for intentional UI changes when they contain
only content that can be shared publicly.
