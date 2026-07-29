# pi-harness-assembly

A hypothesis-testing repo.

## Hypothesis

There are two dominant patterns for teams adopting agents (coding or
otherwise):

1. **Stock agents** (Claude Code, Cursor, Codex CLI, ChatGPT desktop). Fast
   to adopt, but the surface you can shape is small: system prompt, MCP
   servers, maybe a permission list. Real workflow constraints (audit,
   compliance, opinionated pipelines, seat-belted read-only modes, or
   *a different domain entirely*) don't fit.

2. **Full custom harnesses** (roll your own loop on top of an SDK, or fork
   an OSS agent). Fits the workflow exactly, but the team now owns a
   product: tool loop, session storage, TUI, model routing, provider auth,
   compaction, streaming, cancellation, etc. Most teams who go here regret
   the maintenance surface within a quarter.

**The hypothesis:** [pi](https://pi.dev) is a viable *middle path*. It
ships the harness — loop, TUI, sessions, compaction, model routing,
provider auth — and exposes the parts teams actually want to customize —
tools, tool-call gates, commands, skills, prompt templates, *system
prompt*, launch flags — as first-class extension points that live inside
your repo as normal TypeScript and Markdown.

Pi is marketed as a coding agent, but only two things about it are
coding-specific: the four default tools (`read`, `write`, `edit`, `bash`)
and the default system prompt. Both are replaceable — built-ins via
`--no-builtin-tools`, system prompt via `--system-prompt "$(cat ...)"`
per launcher (or globally via `.pi/SYSTEM.md`). Everything else is
domain-agnostic terminal-agent infrastructure. So the hypothesis has two
parts:

- **(a)** For coding workflows, pi is a middle path between stock coding
  agents and a full custom coding harness.
- **(b)** For *non-coding* agent workflows (scraping, research
  assistants, ops runbooks, data pipelines), pi is a middle path between
  "bend a stock coding agent into it" and "build a terminal agent harness
  from scratch."

If the hypothesis holds, a team can get 80% of a custom harness — in
either direction — for single-digit files of code, and can back out to
stock pi at any time by deleting `.pi/`.

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

## The test cases

Cases 1–3 test hypothesis (a): pi as middle path for *coding* workflows.
Cases 4, 5, and 6 test hypothesis (b): pi repurposed as a non-coding
harness, in three distinct domains (scraping, research, log triage) — the
third one containerized — to check that (b) isn't just one lucky fit and
that the same extension surfaces survive being wrapped in Docker.

Each case is a real workflow that a stock agent can't safely do and a full
custom harness is overkill for. Each mixes 2–3 of the strategies above.

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

### Case 4 — Non-coding domain (web scraping harness)

**Team:** anyone who needs a scraping agent and doesn't want to build one
from scratch or bend Claude Code into pretending to be one.
**Need:** pi is no longer a coding agent. `read`/`write`/`edit`/`bash` are
gone. In their place: `fetch_url` and `save_record`. The system prompt
describes a scraping agent, not a coding one. A `/scrape` command kicks off
a job. A skill contains the extraction playbook.
**Strategies used:** E (custom tools + command) + C (skill) + F (launch
profile with `--no-builtin-tools` + per-launcher `--system-prompt`).
**Files:** [`.pi/extensions/scrape.ts`](.pi/extensions/scrape.ts), [`.pi/systems/scrape.md`](.pi/systems/scrape.md), [`.pi/skills/scrape-playbook/SKILL.md`](.pi/skills/scrape-playbook/SKILL.md), [`bin/pi-scrape`](bin/pi-scrape).

### Case 5 — Non-coding domain (research assistant harness)

**Team:** analysts, researchers, anyone who wants an agent that finds
sources, reads them, and takes cited notes — not an agent that writes
code about the topic.
**Need:** four domain tools — `web_search`, `fetch_source`, `add_note`,
`list_notes`. Every claim gets a citation to a URL the agent actually
fetched. Notes accumulate as Markdown under `research-notes/<topic>.md`
across sessions. Coding tools are disabled entirely.
**Strategies used:** E + C + F, same as Case 4, but the *domain* is
different (synthesis with citations, not row extraction). The point of
having both 4 and 5 is to check that non-coding fit isn't a coincidence.
**Files:** [`.pi/extensions/research.ts`](.pi/extensions/research.ts), [`.pi/systems/research.md`](.pi/systems/research.md), [`.pi/skills/research-playbook/SKILL.md`](.pi/skills/research-playbook/SKILL.md), [`bin/pi-research`](bin/pi-research).

### Case 6 — Non-coding domain in a container (log triage, isolated)

**Team:** anyone running an agent against untrusted input — a partner
team's outage bundle, a customer support export, a forensic snapshot.
**Need:** same non-coding reframe as Cases 4 and 5, but the agent must
not see the host filesystem. The whole harness runs inside Docker.
`/logs` is mounted read-only, `triage-output/` is the only writable
path, the container is `--read-only` + `--network none` + non-root, and
`--no-builtin-tools` strips `read`/`write`/`edit`/`bash` at the pi
layer. Two belts: OS isolation on the outside, tool-level path guards on
the inside. The extension registers `list_logs`, `read_log`, `grep_logs`,
`save_incident`, and a `/triage` command.
**Strategies used:** E + C + B + F, same as Cases 4 and 5, plus Docker
as an *outer* wrapper around the launch profile — no new pi surface
required.
**Files:** [`.pi/extensions/triage.ts`](.pi/extensions/triage.ts), [`.pi/systems/triage.md`](.pi/systems/triage.md), [`.pi/skills/triage-playbook/SKILL.md`](.pi/skills/triage-playbook/SKILL.md), [`.pi/prompts/triage.md`](.pi/prompts/triage.md), [`bin/pi-triage`](bin/pi-triage), [`docker/Dockerfile`](docker/Dockerfile), [`docker/README.md`](docker/README.md).

Cases 4, 5, and 6 are the hardest tests. If pi is genuinely a general
terminal-agent harness rather than a coding-specific one, they should
feel no more awkward than Cases 1–3 — and reusing the same six
strategies for three unrelated domains, one of them containerized,
should produce structurally similar results. Case 6 also tests a
secondary claim: because pi's extension surface is just files in
`.pi/`, dropping the whole harness into a container is a Dockerfile,
not a rewrite.

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

# Case 4: launch pi as a scraping agent (no coding tools)
./bin/pi-scrape
> /scrape https://news.ycombinator.com/ get the top 30 stories
# or one-shot:
./bin/pi-scrape https://news.ycombinator.com/ "top 30 stories"
ls scrape-output/

# Case 5: launch pi as a research assistant (no coding tools)
./bin/pi-research "what are the tradeoffs of vector vs bm25 retrieval?"
ls research-notes/

# Case 6: launch pi as a log-triage agent, isolated in Docker.
# First run builds the image (docker/Dockerfile). Subsequent runs reuse it.
./bin/pi-triage                            # interactive over docker/sample-logs
./bin/pi-triage /path/to/some/logs         # different log corpus
./bin/pi-triage -- "focus on auth service" # one-shot with a focus
cat triage-output/incidents.jsonl
```

## What this repo is trying to falsify

The hypothesis fails if any of these are true:

- Any case requires forking pi or patching its internals.
- Any case requires code that would be shorter as a from-scratch harness.
- The extension surface can't express the constraint (e.g. can't actually
  block a tool call, can't actually add a command).

The repo below is the evidence. Each case is <100–200 lines of code +
config. Cases 4 and 5 are the sharpest tests: if pi can host a scraping
agent *and* a research assistant without feeling like a hack, and the
same six-strategy taxonomy applies to both, the "middle path" claim
generalizes past coding.
