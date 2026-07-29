---
name: triage-playbook
description: Log-triage loop (enumerate → tail-sample → grep error patterns → cluster → save one incident per distinct issue with cited evidence) using `list_logs`, `read_log`, `grep_logs`, `save_incident`. Load when the user asks to triage logs, investigate an outage from logs, summarize log errors, or invokes `/triage`.
---

# triage-playbook

Load this skill when the user asks to triage logs, investigate an
outage, or invokes `/triage`.

## The loop

1. **Enumerate.** Call `list_logs()`. Note filenames, sizes, and mtimes.
   If nothing is mounted, stop and tell the user.
2. **Recon.** For each interesting log, `read_log(path, tail=200)` to see
   the recent shape (format, timestamps, level field).
3. **Sweep for known-bad patterns.** Run `grep_logs` for:
   - `error|exception|panic|fatal` (case-insensitive)
   - `timeout|timed out|deadline exceeded`
   - `refused|reset|unreachable`
   - `5\d\d\s` (5xx HTTP)
   - `OOM|out of memory|killed`
4. **Cluster.** Group matches by likely root cause. Ten stack traces from
   the same crash = one incident with ten evidence lines. Do not save
   ten near-duplicate records.
5. **For each distinct incident**, call `save_incident` once with:
   - `severity` — honest band (see the system prompt).
   - `summary` — one line, no timestamps, no PII.
   - `component` — service or module, inferred from filename/content.
   - `evidence` — 1–10 `path:line` refs from real matches. No fabrication.
   - `next_action` — concrete next step for on-call (e.g. "check
     upstream `payments` health; last 5xx spike at 14:02").
6. **Summarize.** Print one final line:
   `triaged N files → X critical / Y error / Z warn / W info`.

## Boundaries

- Only paths under `/logs` are readable. `read_log("../etc/passwd")` will
  be refused — don't try.
- Only `triage-output/incidents.jsonl` is writable. There is no `write`,
  `edit`, or `bash` tool.
- If asked to fix the underlying bug, decline: this harness triages, it
  does not patch. Point the user at the coding harness.
