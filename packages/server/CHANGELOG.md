# Changelog

This changelog covers the Express backend in `packages/server/`.

This repository does not use git tags yet, so the `Initial` section below summarizes the pre-changelog state currently on `main`.

## [Unreleased]

### Changed

- Migrated realtime chat streaming from WebSocket transport to Server-Sent Events and added dedicated SSE transport coverage. (#58)

### Fixed

- Fixed CORS configuration to support origin lists from environment configuration. (#52)
- Fixed assistant runtime handling so stream errors are logged and failed runs are surfaced correctly. (#38, #39)
- Fixed session isolation and first-message duplication issues in runtime and session flows. (#57)
- Tightened session deletion request handling to support reliable sidebar delete flows. (#32)

## [Initial]

### Added

- Added the Express server package, shared config loading, Drizzle setup, migrations, and CLI entrypoints for server and REPL workflows.
- Added authenticated chat control-plane APIs, per-session conversational actor runtime, persistence adapters, and realtime hub infrastructure.

### Changed

- Reorganized the backend into `internal/app`, `internal/domain`, and `internal/infra` layers with extracted session use cases and HTTP router factories.

### Fixed

- Fixed control-plane request handling, auth enforcement, session message validation, API error mapping, atomic message sequencing, and Drizzle bootstrap flow.
- Improved server runtime stability for chat agent execution and realtime event delivery, including server agent thinking-stream handling. (#18)
