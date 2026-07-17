# Chatbot Experiments

Standalone Chatbot Experiments chat stack.

## Structure

- `apps/web` — Next.js App Router host for `/chat` and `/chat/[sessionId]`
- `packages/server` — Express backend that serves session, message, realtime SSE, health, and readiness APIs
- `packages/agent-runtime` — runtime that turns persisted user messages into assistant runs
- `packages/agent-core` — provider-independent agent loop
- `packages/ai` — Azure OpenAI provider adapter
- `packages/llm-core` — provider-neutral LLM contracts and stream primitives
- `packages/core` — domain use cases, events, realtime hub, and session contracts
- `packages/database` — MySQL repositories and migrations
- `packages/client` — frontend chat API hooks, identity state, and navigation adapter contracts
- `packages/ui` — shared UI primitives and CSS tokens used by chat
- `packages/views` — shared chat page components
- `packages/protocol` — shared chat/session/realtime schemas
- `packages/cli` — database migration and local CLI utilities
- `e2e` — Playwright chat tests

## Local development

```bash
cp .env.example .env
pnpm install
make dev
```

`make dev` installs dependencies, starts the local MySQL container, runs backend migrations, starts the Express API on `PORT` (default `8080`), then starts the Next.js chat app on `WEB_PORT` (default `3000`).

The web app reads `NEXT_PUBLIC_AI_API_URL` and defaults to `http://localhost:8080`.

## Useful commands

```bash
make setup          # install deps, create server env, start MySQL
make server         # run backend only
make start          # start backend + frontend without reinstalling
make stop           # stop local server/web processes
make migrate-up     # run database migrations through the CLI
pnpm check          # format/lint, boundary check, typecheck, unit tests
pnpm --dir apps/web build
pnpm test:e2e       # starts full stack through Playwright webServer
```

## Required runtime environment

Copy `.env.example` to `.env` and fill the Azure OpenAI values before expecting live assistant responses:

```env
AZURE_OPENAI_ENDPOINT=https://example.openai.azure.com/
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_API_VERSION=2024-10-21
```
