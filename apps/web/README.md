# `apps/web`

`apps/web` is the standalone Next.js 16 host app for the migrated DentalTrip AI chat page.

## Responsibilities

- Provide App Router route files for `/chat` and `/chat/[sessionId]`
- Configure React Query and platform-specific providers
- Bridge Next.js navigation into the shared `NavigationAdapter`
- Render shared chat views from `@dentaltrip-ai/views`
- Inject `NEXT_PUBLIC_AI_API_URL` into `@dentaltrip-ai/client`

## Routes

- `/` — redirects to `/chat`
- `/chat` — empty chat state
- `/chat/[sessionId]` — existing chat session

## Local development

```bash
pnpm --dir apps/web dev
```

## Runtime environment variables

- `NEXT_PUBLIC_AI_API_URL` — defaults to `http://localhost:8080`
