---
name: deploy-runbook
description: Canonical four-stage deploy pipeline (preflight → canary → verify → promote) using the `deploy_service` tool. Load when the user asks to deploy, ship, release, roll out, or promote a service, or when `/deploy` is invoked.
---

# deploy-runbook

Use this skill when the user asks to deploy, ship, release, roll out, or
promote a service. Also load it when the `/deploy` command was used.

## Preconditions

Before touching anything, confirm you have:

1. A **service name** (e.g. `checkout`, `web`, `api-gateway`).
2. A **target environment**: `staging` or `prod`.
3. A **change summary** (one line: what is being shipped and why).

If any are missing, ask the user in a single message. Do not proceed
partially.

## The pipeline

Every deploy runs four stages in order. Use the `deploy_service` tool for
each. Never skip a stage. Never reorder.

1. **preflight** — image built, tests green, migrations analyzed.
2. **canary** — 5% traffic, watch error rate and p95 latency.
3. **verify** — SLOs must stay green for the observation window.
4. **promote** — 100% traffic.

## Rules

- If any stage fails, **stop**. Report the failure verbatim. Do not attempt
  the next stage. Do not retry without explicit user approval.
- For `env=prod`, **always stop before `promote`** and ask the user to
  confirm. Include the canary and verify output in your confirmation
  message.
- For `env=staging`, you may run all four stages without stopping unless a
  stage fails.
- After `promote` succeeds, summarize the full pipeline output as a single
  short changelog entry (one line per stage, plus the change summary).

## Anti-patterns

- Do not call `bash` to run `kubectl`, `argo`, `spinnaker`, or any deploy
  tool directly. Always use `deploy_service`. The tool is the audited path.
- Do not "just check" prod by running the pipeline against it. If the user
  did not ask for prod, use staging.
- Do not batch multiple services in one deploy. One service per session.
