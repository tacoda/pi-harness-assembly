# pi-harness-assembly

A hypothesis-testing repo.

## Hypothesis

There are two dominant patterns for teams adopting coding agents:

1. **Stock agents** (Claude Code, Cursor, Codex CLI). Fast to adopt, but the
   surface you can shape is small: system prompt, MCP servers, maybe a
   permission list. Real workflow constraints (audit, compliance, opinionated
   pipelines, seat-belted read-only modes) don't fit.

2. **Full custom harnesses** (roll your own loop on top of an SDK, or fork an
   OSS agent). Fits the workflow exactly, but the team now owns a product:
   tool loop, session storage, TUI, model routing, compaction, etc. Most teams
   who go here regret the maintenance surface within a quarter.

**The hypothesis:** [pi](https://pi.dev) is a viable *middle path*. It ships
the harness (loop, TUI, sessions, compaction, model routing, providers), and
exposes the parts teams actually want to customize — tools, tool-call gates,
commands, skills, prompt templates, system prompt, launch flags — as
first-class extension points that live inside your repo as normal TypeScript
and Markdown.

If the hypothesis holds, a team can get 80% of a custom harness for
single-digit files of code, and can back out to stock pi at any time by
deleting `.pi/`.

## The strategies

Pi exposes six extension surfaces. A team's "custom harness" is really some
combination of these:

| Strategy | Mechanism | When to reach for it |
|---|---|---|
| **A. Repo context** | `AGENTS.md` / `CLAUDE.md`, `.pi/SYSTEM.md` | Baseline conventions, house style, always-on rules. Zero code. |
| **B. Prompt templates** | `.pi/prompts/*.md`, invoked as `/name` | Repeatable workflows a human kicks off ("do a security review of X"). |
| **C. Skills** | `.pi/skills/<name>/SKILL.md` | On-demand runbooks the *model* loads when a task matches. Bundles instructions + supporting files. |
| **D. Tool gates** | Extension `pi.on("tool_call", ...)` | Compliance, audit, blast-radius control. Runs on every tool call. |
| **E. Custom tools / commands** | Extension `pi.registerTool` / `pi.registerCommand` | Wrap internal CLIs, deploy pipelines, ticketing, etc. as first-class actions. |
| **F. Launch profile** | Wrapper script + `pi --tools ... --prompt-template ... --skill ...` | Ship a "mode" (read-only reviewer, incident responder) as a single command. |

The cost curve looks like: A ≪ B ≈ C ≪ D ≈ E ≪ F. A team can start at A and
add strategies as pain shows up. None of them require forking pi.

## The three test cases

Each case is a real workflow that a stock agent can't safely do and a custom
harness is overkill for. Each mixes 2–3 of the strategies above.

### Case 1 — Regulated shop (compliance guardrails)

**Team:** fintech / health / anything with an auditor.
**Need:** every tool call logged to disk; writes to `.env`, secrets, and
prod-config paths blocked; destructive bash requires a second confirmation.
**Strategies used:** D (tool gate) + A (repo context).
**Files:** [`.pi/extensions/audit-and-guard.ts`](.pi/extensions/audit-and-guard.ts), [`AGENTS.md`](AGENTS.md).

### Case 2 — Platform team (opinionated deploy workflow)

**Team:** internal platform / DevOps.
**Need:** a `/deploy` command that runs the org's canonical deploy playbook
(preflight → canary → verify → promote), with a `deploy_service` tool the
model can call and a skill the model loads when a user says "ship this".
**Strategies used:** E (custom tool + command) + C (skill) + B (prompt template).
**Files:** [`.pi/extensions/deploy.ts`](.pi/extensions/deploy.ts), [`.pi/skills/deploy-runbook/SKILL.md`](.pi/skills/deploy-runbook/SKILL.md), [`.pi/prompts/deploy.md`](.pi/prompts/deploy.md).

### Case 3 — Research team (read-only notebook review)

**Team:** ML research / data science.
**Need:** a locked-down "explain and critique my notebook" mode. Model can
read, grep, list — nothing else. Follows a standardized review rubric.
**Strategies used:** F (launch profile) + C (skill) + B (prompt template).
**Files:** [`bin/pi-review`](bin/pi-review), [`.pi/skills/notebook-review/SKILL.md`](.pi/skills/notebook-review/SKILL.md), [`.pi/prompts/review-notebook.md`](.pi/prompts/review-notebook.md).

## How to run the test

Install pi:

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
export ANTHROPIC_API_KEY=sk-ant-...
```

Then:

```bash
# Case 1: just start pi in this repo. AGENTS.md loads automatically,
# the audit/guard extension is discovered from .pi/extensions/.
# Try: "delete node_modules and rewrite .env with new keys"
pi
tail -f .pi/audit.log     # in another shell

# Case 2: inside pi, either invoke the prompt template...
/deploy
# ...or just ask naturally; the skill triggers on deploy-shaped requests:
> ship the checkout service to staging

# Case 3: launch the read-only reviewer profile
./bin/pi-review path/to/notebook.ipynb
```

## What this repo is trying to falsify

The hypothesis fails if any of these are true:

- Any case requires forking pi or patching its internals.
- Any case requires code that would be shorter as a from-scratch harness.
- The extension surface can't express the constraint (e.g. can't actually
  block a tool call, can't actually add a command).

The repo below is the evidence. Each case is <100 lines of code + config.
