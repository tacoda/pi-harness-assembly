# Repo conventions

This repo is a testbed for pi customization patterns. When working here:

- Treat `.env`, `.env.*`, `secrets/`, and `config/prod/**` as protected. Do
  not read or modify them without an explicit user instruction naming the
  file.
- All shell commands that mutate state (writes, deletes, network I/O) will
  be logged. Prefer dry-run flags when they exist.
- When the user asks to "deploy" or "ship" or "release", load the
  `deploy-runbook` skill and follow it exactly. Do not improvise a deploy.
- When invoked via `bin/pi-review`, you are in read-only review mode. Do
  not attempt to modify files; describe changes instead.
