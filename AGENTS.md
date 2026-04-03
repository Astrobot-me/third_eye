# Repository Guidelines for Agentic Coding Agents

## Project Structure & Module Organization
Core app code lives in `src/` (TypeScript + React). UI components are grouped under `src/components/<feature>/` (for example, `src/components/control-tray/ControlTray.tsx`). Shared runtime logic is split into `src/contexts/`, `src/hooks/`, and `src/lib/` (audio, websocket client, utilities, worklets). Global entry points are `src/index.tsx` and `src/App.tsx`. Static files are in `public/`, and docs/assets used by README are in `readme/`.

### Key Directories:
- `src/components/` - Feature-specific React components (Altair, ControlTray, SidePanel, etc.)
- `src/contexts/` - React context providers (LiveAPIContext)
- `src/hooks/` - Custom React hooks (use-media-stream-mux, use-screen-capture, use-webcam)
- `src/lib/` - Utility classes and helpers (audio-recorder, websocket client)
- `src/types.ts` - Shared TypeScript interfaces and types

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm start`: run local dev server on `http://localhost:3000`.
- `npm run start-https`: run dev server with HTTPS enabled.
- `npm test`: start Jest + React Testing Library in watch mode.
- `npm test -- --watchAll=false`: run tests once and exit (useful for CI)
- `npm test -- --testNamePattern="pattern"`: run tests matching a pattern
- `npm test -- src/App.test.tsx`: run tests for a specific file
- `npm test -- --coverage`: generate coverage report
- `npm run build`: create production bundle in `build/`.
- `npm run lint`: run ESLint (if configured separately from react-scripts)
- `npm run typecheck`: run TypeScript compiler (tsc --noEmit)

Set `REACT_APP_GEMINI_API_KEY` in `.env` before running locally.

### Test Running Guidelines:
- To run a single test by name: `npm test -- --watchAll=false -t "test description exactly"`
- To run tests in a specific directory: `npm test -- src/components/ --watchAll=false`
- To update snapshots: `npm test -- -u`
- To run tests with verbose output: `npm test -- --verbose`
- To debug tests: `npm test -- --inspect-brk`

## Coding Style & Naming Conventions
Use TypeScript, functional React components, and 2-space indentation (follow existing files). Component files use PascalCase (`SettingsDialog.tsx`); hooks use `use-*.ts` names (`use-live-api.ts`); style files use kebab-case (`side-panel.scss`). Keep feature-local styles beside components. Prefer explicit types for shared interfaces in `src/types.ts` or local module types. Linting is provided through `react-scripts` ESLint (`react-app`, `react-app/jest`).

### Import Order:
1. React imports (`import { useState } from "react"`)
2. Third-party library imports (`import vegaEmbed from "vega-embed"`)
3. Relative imports from same component directory
4. Relative imports from parent directories (`../../contexts/LiveAPIContext`)
5. Absolute imports from `src/` (`@/components/...` if configured)
6. Type imports when separate (`import type { SomeType } from "./types"`)

### TypeScript Guidelines:
- Use explicit return types for exported functions
- Define interfaces in `src/types.ts` for shared types
- Use `type` over `interface` when needing union/intersection types
- Avoid `any` type; use `unknown` when type is uncertain
- Prefer const assertions for literal objects: `const obj = { prop: "value" } as const`
- Use enums sparingly; prefer union types for better type safety
- Mark readonly properties as `readonly` when appropriate
- Use generic constraints to limit type parameters: `<T extends SomeType>`

### React Component Patterns:
- Use functional components with hooks
- Memoize expensive computations with `useMemo` and callbacks with `useCallback`
- Wrap components in `React.memo()` when props are stable and re-renders are costly
- Use early returns for conditional rendering rather than ternary operators when complex
- Separate concerns: keep UI components presentational, move logic to custom hooks
- Use fragments (`<>...</>`) instead of unnecessary divs when possible
- Custom hooks should use `use` prefix and return tuple or object consistently
- Custom hooks that return cleanup functions should document this clearly

### Error Handling:
- Handle API errors gracefully with try/catch or error boundaries
- Display user-friendly error messages rather than raw error objects
- Log errors to console for development but don't expose sensitive info
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safe property access
- Validate props with PropTypes or TypeScript interfaces
- For async functions, always catch/reject promises appropriately
- Use error boundaries for React component tree error handling

### Styling Conventions:
- Use SCSS modules for component-specific styling (`component-name.scss`)
- Follow BEM-like naming: `.block`, `.block__element`, `.block--modifier`
- Use CSS custom properties (variables) for themeable values
- Avoid !important except for utility classes
- Keep styles scoped to components; avoid global style leaks
- Use classnames library for conditional class application
- Use CSS variables for theming: `--primary-color: #value;`
- For animations, prefer CSS over JavaScript when possible
- Use responsive design principles with media queries

### Naming Conventions:
- Components: PascalCase (`MyComponent.tsx`)
- Hooks: camelCase with `use` prefix (`useLiveAPI.ts`)
- Constants: UPPER_SNAKE_CASE (`MAX_RETRIES`)
- Variables and functions: camelCase (`isLoading`, `fetchData()`)
- Files: kebab-case for styles (`side-panel.scss`), PascalCase for components (`ControlTray.tsx`)
- Type definitions: PascalCase interface names (`interface UserProps`)
- Enum values: PascalCase (`MediaType.Audio`)
- CSS classes: kebab-case (`.control-tray`, `.action-button`)

## Testing Guidelines
Testing uses Jest with React Testing Library (`src/setupTests.ts`). Keep tests close to source using `*.test.tsx` naming (example: `src/App.test.tsx`). For behavior changes, add or update tests covering rendering, user interaction, and critical state transitions. Run `npm test` locally before opening a PR. No formal coverage gate is configured, but new logic should include meaningful assertions.

### Testing Best Practices:
- Test user behavior, not implementation details
- Use `getByRole`, `getByLabelText`, `getByPlaceholderText` for querying elements
- Prefer user event simulation over direct DOM manipulation
- Mock external dependencies (API calls, timers, etc.) with jest.mock()
- Test loading, error, and empty states
- Use `await waitFor()` for asynchronous updates
- Clean up mocks and spies in `afterEach()` hooks
- Test custom hooks with `@testing-library/react-hooks` or render in wrapper components
- For context consumers, wrap tests in the appropriate provider
- Use `act()` wrapper for async assertions when needed
- Test accessibility with jest-axe when appropriate

### Test File Organization:
- Place test files next to the component they test: `Component.test.tsx`
- Use descriptive test suite names: `describe('ComponentName', () => {`
- Use clear test names: `it('should display loading state when fetching data', () => {`
- Group related tests with nested describes when beneficial
- Use beforeEach/afterEach for shared setup/teardown
- Test custom hooks in isolation when possible
- Test edge cases and error conditions

## Commit & Pull Request Guidelines
Recent history shows short, direct commit subjects (for example, `mode updated`). Prefer concise imperative summaries like `add screen-capture toggle` and keep one logical change per commit. For PRs, include:
- what changed and why,
- linked issue/ticket (if available),
- test evidence (`npm test`, `npm run build`),
- screenshots or short clips for UI changes.

### Commit Message Format:
- Use imperative mood: "add feature" not "added feature"
- Keep subject line under 50 characters when possible
- Reference issue numbers: "fix login redirect (#123)"
- Separate subject from body with blank line when body is needed
- Use body to explain why, not what (what is evident from diff)
- For reverts: "revert: commit message\n\nThis reverts commit <hash>"
- For fixes: "fix: prevent null pointer in user profile"
- For features: "add: export data as CSV functionality"
- For refactors: "refactor: simplify authentication flow"
- For docs: "docs: update API reference for new endpoints"
- For style: "style: fix indentation in user service"
- For tests: "test: add coverage for edge cases"
- For chore: "chore: update dependencies"

### Pull Checklist:
- [ ] Code follows established patterns and conventions
- [ ] Tests added/updated for new functionality
- [ ] No console.log or debugger statements in production code
- [ ] TypeScript compiles without errors
- [ ] ESLint passes (run `npm run lint` if available)
- [ ] Changes work in all supported browsers
- [ ] Accessibility considerations addressed (aria-labels, keyboard navigation)
- [ ] Performance implications considered
- [ ] Dependencies updated to latest compatible versions
- [ ] Documentation updated if needed
- [ ] Changelog entry added if applicable

## Security & Configuration Tips
Do not commit secrets. Keep API keys in `.env` (`REACT_APP_GEMINI_API_KEY`) and verify `.gitignore` coverage for local-only files.

### Environment Variables:
- Prefix React app env vars with `REACT_APP_` for webpack injection
- Never commit `.env` files; use `.env.example` for template
- Validate required env vars at application startup
- Use different env files for different environments (`.env.development`, `.env.production`)
- Consider using env-cmd for complex env var management
- Validate env var values (non-empty strings, valid URLs, etc.)

## Specific Patterns in This Codebase

### Live API Integration:
- Use `useLiveAPIContext()` hook to access client and configuration methods
- Configure API with `setConfig()` in `useEffect()` with empty deps array for init
- Handle tool calls with `client.on("toolcall", callback)` and cleanup with return function
- Send tool responses with `client.sendToolResponse({ functionResponses: [...] })`
- Send realtime input with `client.sendRealtimeInput([{ mimeType, data }])`
- Always check for connection state before sending data
- Handle disconnections gracefully with reconnection logic
- Use appropriate modalities based on use case (AUDIO, VIDEO, TEXT)

### Media Stream Handling:
- Use custom hooks (`useWebcam()`, `useScreenCapture()`) for media stream management
- These hooks return objects with `{ isStreaming, start, stop }` properties and methods
- Always cleanup streams in stop functions and effect cleanup
- Video frames are sent via canvas element for efficiency
- Handle media stream errors and permission denials gracefully
- Respect user privacy by only accessing media when needed
- Stop media streams when component unmounts or not visible

### Audio Processing:
- Audio recording handled by `AudioRecorder` class in `lib/audio-recorder`
- Volume monitoring through event subscription: `recorder.on("volume", callback)`
- Audio data sent as base64-encoded PCM at 16kHz sample rate
- Muting controls both microphone and speaker output
- Handle audio context suspension/resumption appropriately
- Use appropriate sample rates for different use cases
- Consider audio fingerprinting privacy implications

### Component Communication:
- Context API for global state (LiveAPIContext)
- Props drilling avoided through context consumption
- Callback props for child-to-parent communication (`onVideoStreamChange`)
- Refs used for direct DOM manipulation when necessary (video, canvas elements)
- Use forwardRef when exposing refs from components
- Consider using state management libraries for complex state (Zustand is used)
- Keep component APIs minimal and focused

## Performance Considerations
- Use `React.memo()` for components with stable props
- Memoize expensive calculations with `useMemo`
- Throttle/rAF for frequent updates (video frame sending at 0.5fps)
- Clean up intervals, timeouts, and event listeners in effect cleanup
- Lazy load heavy dependencies when possible
- Consider code splitting for large components
- Use production builds for accurate performance testing
- Bundle analyzer to identify size optimization opportunities
- Optimize images and assets
- Use HTTP caching effectively
- Minimize main thread work
- Consider web workers for expensive computations