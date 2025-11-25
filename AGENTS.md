# Repository Guidelines

## Project Structure & Module Organization
- `src/index.ts`: Bun server that caches and serves Zhihu answers, reads optional auth headers from env (`ZHIHU_HEADER_*`) or `data/zhihu-headers.json`, and exposes `/api/zhihu/*`.
- `src/frontend.tsx` + `App.tsx`, `ZhihuComments.tsx`, `APITester.tsx`: React UI; Tailwind styles come from `src/index.css` and are bundled via the Tailwind plugin.
- `data/`: Local cache files (`zhihu-comments.json`) and optional private headers file (`zhihu-headers.json`, ignored by Git). `dist/`: Build output. `build.ts`: Bun build script that bundles all `src/*.html` entrypoints with Tailwind.

## Build, Test, and Development Commands
- Install: `bun install` (installs Bun deps; prefers local `bun.lock`).
- Dev server: `bun dev` (hot reloads `src/index.ts` and serves the React app).
- Production run: `bun start` (runs `src/index.ts` with `NODE_ENV=production`).
- Build assets: `bun run build.ts [--outdir dist --minify --sourcemap=linked ...]` (cleans `dist/` first, prints output table).
- No automated test suite is defined yet; run app smoke checks via `bun dev` and hitting `/api/zhihu/comments`.

## Coding Style & Naming Conventions
- Language: TypeScript + React functional components; Bun runtime APIs for server tasks.
- Formatting: 2-space indent, double quotes in TSX/TS to match existing files, trailing commas allowed. Keep types explicit for API payloads and helpers.
- Naming: Functions/components in PascalCase for React, camelCase for helpers/variables, SCREAMING_SNAKE_CASE for constants (e.g., `ZHIHU_QUESTION_ID`).
- Styling: Tailwind utility classes; keep semantic HTML and small, composable components.

## Testing Guidelines
- Currently no formal tests. Prefer adding lightweight integration checks around API handlers if expanded.
- For manual checks: `curl -X POST http://localhost:3000/api/zhihu/refresh` then `curl http://localhost:3000/api/zhihu/comments` to confirm cached data.

## Commit & Pull Request Guidelines
- Commits: Use clear, present-tense summaries (e.g., `Add zhihu cache read path`). Squash small fixups locally when possible.
- Pull requests: Include purpose, user-facing behavior changes, and any manual test notes. Link related issues if applicable. Attach UI screenshots/gifs for front-end changes.

## Security & Configuration Notes
- Do **not** commit real Zhihu credentials. Store overrides in `data/zhihu-headers.json` (gitignored) or export env vars like `ZHIHU_HEADER_COOKIE=...`.
- The server respects a 15-minute background refresh; be mindful of Zhihu rate limits when adjusting `PAGE_FETCH_DELAY_MS` or `MAX_PAGES`.
- Remove sensitive local cache files in `data/` before sharing artifacts; `dist/` can be regenerated from source.
