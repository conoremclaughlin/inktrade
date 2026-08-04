# Agent Guidelines

This is the **canonical reference** for all AI agents working in this repository. If you're Claude, Gemini, GPT, or any other model: this file is for you. Model-specific files (CLAUDE.md, GEMINI.md) point here.

## Session Initialization (IMPORTANT)

**At the start of every new session**, establish identity and call bootstrap:

### Step 1: Determine Your Identity

Identity is resolved in layers. **Stop at the first match** — do not continue checking lower layers:

1. **System prompt override**: If the system prompt contains an "Identity Override" section specifying your agent ID, use that. **Stop here.**
2. **Environment variable**: Run `echo $AGENT_ID` in a shell. If it returns a non-empty value, use that as your agentId. **Stop here.**
3. **Repo-level identity**: Read `.ink/identity.json` in the current repo.
4. **Central config**: Read `~/.ink/config.json` agentMapping.

### Step 2: Load User Config

Read from `~/.ink/config.json`:

```json
{"userId": "...", "email": "...", "agentMapping": {"claude-code": "wren", ...}}
```

### Step 3: Call Bootstrap with Identity

```
bootstrap(userId: "<from config>", agentId: "<your identity>")
```

### Step 4: Start or Resume Session

Read `studioId` from `.ink/identity.json` (if present) and pass it to `start_session`.

Throughout the session, use `update_session_phase` for structural status changes and `remember` for decisions, insights, and important events.

**Note**: Never commit PII (emails, user IDs) to the repository. Always read from config files.

## Project Overview

Inktrade is an options trading intelligence platform — leverage modelling, Greeks
visualization, LETF analysis, and portfolio risk. The repo is a yarn workspaces monorepo:

- **`packages/engine`** — pure TypeScript domain logic: options math, market data providers, LETF/rolling/portfolio analysis. No UI, no HTTP server.
- **`packages/client`** — shared client layer: API wire types, fetch client, React Query definitions, indicator math. Consumed by both web and mobile.
- **`packages/web`** — Next.js web application (Next.js 16, React 19, Tailwind v4)
- **`packages/mobile`** — Expo / React Native app (Expo SDK 57, RN 0.86, React Navigation)
- **`packages/cli`** — command-line interface

## Architecture

```
packages/
  engine/src/       # options math, providers, analysis (platform-agnostic)
  client/src/       # types, api client, query defs, indicators (platform-agnostic)
  web/src/
    app/            # Next.js App Router pages + API routes
    components/     # React DOM components (recharts, lightweight-charts)
    lib/            # web-only hooks and utilities
  mobile/
    src/screens/    # React Navigation screens
    src/components/ # React Native components (react-native-svg)
    src/charts/     # WebView-hosted chart document
    src/ui/         # theme tokens and formatters
```

### Sharing rule

**Data is shared; rendering is not.** Anything platform-agnostic — wire types, fetching,
query keys, stores, indicator math — belongs in `packages/client` or `packages/engine`.
Chart and view components stay in their platform package, because web renders to the DOM
and mobile renders natively.

Mobile is native React Native throughout, with one deliberate exception: the candlestick
chart runs `lightweight-charts` inside a WebView, since replicating its crosshair and
pan/zoom natively is a project in itself. Everything else uses `react-native-svg`.

## Coding Conventions

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full reference on coding style, git conventions, and PR process. Key points:

- Strict TypeScript, avoid `any`
- Angular commit convention: `feat(scope): description`
- Do not squash commits on merge
- camelCase for variables/functions, PascalCase for types/components

## Development Commands

```bash
# Root
yarn install          # Install all workspaces
yarn dev              # Web dev server
yarn build            # Build all packages
yarn lint             # Lint all packages
yarn type-check       # Type-check all packages
yarn test             # Run all tests

# Package-scoped
yarn workspace @inktrade/web dev
yarn workspace @inktrade/web build

# Mobile (Expo)
yarn workspace @inktrade/mobile start      # Metro bundler
yarn workspace @inktrade/mobile ios        # iOS simulator
yarn workspace @inktrade/mobile android    # Android emulator
```
