# Repository Guidelines

## Project Structure & Module Organization
Core app code lives in `src/` (TypeScript + React). UI components are grouped under `src/components/<feature>/` (for example, `src/components/control-tray/ControlTray.tsx`). Shared runtime logic is split into `src/contexts/`, `src/hooks/`, and `src/lib/` (audio, websocket client, utilities, worklets). Global entry points are `src/index.tsx` and `src/App.tsx`. Static files are in `public/`, and docs/assets used by README are in `readme/`.

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm start`: run local dev server on `http://localhost:3000`.
- `npm run start-https`: run dev server with HTTPS enabled.
- `npm test`: start Jest + React Testing Library in watch mode.
- `npm run build`: create production bundle in `build/`.

Set `REACT_APP_GEMINI_API_KEY` in `.env` before running locally.

## Coding Style & Naming Conventions
Use TypeScript, functional React components, and 2-space indentation (follow existing files). Component files use PascalCase (`SettingsDialog.tsx`); hooks use `use-*.ts` names (`use-live-api.ts`); style files use kebab-case (`side-panel.scss`). Keep feature-local styles beside components. Prefer explicit types for shared interfaces in `src/types.ts` or local module types. Linting is provided through `react-scripts` ESLint (`react-app`, `react-app/jest`).

## Testing Guidelines
Testing uses Jest with React Testing Library (`src/setupTests.ts`). Keep tests close to source using `*.test.tsx` naming (example: `src/App.test.tsx`). For behavior changes, add or update tests covering rendering, user interaction, and critical state transitions. Run `npm test` locally before opening a PR. No formal coverage gate is configured, but new logic should include meaningful assertions.

## Commit & Pull Request Guidelines
Recent history shows short, direct commit subjects (for example, `mode updated`). Prefer concise imperative summaries like `add screen-capture toggle` and keep one logical change per commit. For PRs, include:
- what changed and why,
- linked issue/ticket (if available),
- test evidence (`npm test`, `npm run build`),
- screenshots or short clips for UI changes.

## Security & Configuration Tips
Do not commit secrets. Keep API keys in `.env` (`REACT_APP_GEMINI_API_KEY`) and verify `.gitignore` coverage for local-only files.
