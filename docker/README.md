# docker/ — Case 6: containerized pi harness

This directory backs Case 6 in the top-level README: **pi as a
log-triage harness, isolated in Docker.**

## Why containerize a pi harness

The other five cases run pi directly on your machine. That's fine when
the workflow is trusted: you wrote the extensions, you trust the model
with your filesystem, and blast radius is scoped by tool gates + repo
context.

Case 6 is the other regime. Triage runs against *someone else's* logs —
a partner team's outage bundle, a customer support export, a forensic
snapshot. You want:

- **Filesystem isolation.** The agent sees `/logs` and nothing else on
  the host. No `~/.ssh`, no `.env`, no source tree.
- **Process isolation.** No accidental host commands, even if the model
  found a way to reach a shell. (It shouldn't — `--no-builtin-tools`
  strips `bash` — but defense in depth.)
- **Predictable runtime.** Node version, pi version, and extension code
  are all pinned in the image. No "works on my laptop."
- **Non-root.** The container runs as UID 10001.

Two belts:

1. **Outer belt (Docker):** the container only mounts `/logs` (ro) and
   `/work/triage-output` (rw). Everything else on the host is invisible.
2. **Inner belt (extension):** `read_log` and `grep_logs` refuse paths
   that resolve outside `TRIAGE_LOGS_DIR`. Even if you fat-fingered a
   mount, the tool would still reject a path escape.

## Files

- [`Dockerfile`](Dockerfile) — node:20-alpine + pi, non-root, no
  bundled extension code (mounted at runtime).
- [`sample-logs/`](sample-logs/) — a small synthetic log corpus so
  `./bin/pi-triage` demoes end-to-end with no real data.

## Build

```bash
docker build -t pi-triage docker/
```

## Run

The launcher [`bin/pi-triage`](../bin/pi-triage) wraps the `docker run`
invocation:

```bash
./bin/pi-triage                  # interactive session over docker/sample-logs
./bin/pi-triage /path/to/logs    # point at a different log directory
./bin/pi-triage -- "focus on auth service last hour"   # one-shot
```

Under the hood it runs, roughly:

```bash
docker run --rm -it \
  --network none \
  --read-only \
  --tmpfs /tmp \
  -v "$REPO":/work \
  -v "$LOGS":/logs:ro \
  -e ANTHROPIC_API_KEY \
  pi-triage \
  --no-builtin-tools \
  --system-prompt "$(cat .pi/systems/triage.md)" \
  --name "triage session"
```

Notes:

- `--network none` — the triage harness has no legitimate need to talk
  to the internet. (The pi *provider* call happens from the host-side
  process if you use `--print` streaming through the launcher, or it
  happens from inside the container if run interactively. The compose
  invocation below uses in-container providers, so `--network none` is
  swapped for a scoped egress policy in a real deployment.)
- `--read-only` — the container root filesystem is read-only; only
  `/tmp` (tmpfs) and the explicitly-mounted `/work/triage-output` are
  writable.
- The repo mount at `/work` means edits to
  `.pi/extensions/triage.ts` on the host are picked up on the next run
  without rebuilding the image.

## What's *not* here

- No secrets baked into the image. `ANTHROPIC_API_KEY` is passed via
  environment at run time.
- No copy of the log corpus in the image. Logs are mounted read-only
  from the host per invocation.
- No `bash` in the model's tool list. `--no-builtin-tools` drops
  `read`/`write`/`edit`/`bash`; only the four extension tools remain.
