---
name: research-playbook
description: Multi-step research loop (decompose → search → fetch → cited notes → synthesize) using `web_search`, `fetch_source`, `add_note`, `list_notes`. Load when the user asks a research question, says "look into" something, or invokes `/research`.
---

# research-playbook

Load this skill when the user asks a research question, asks you to "look
into" something, or invokes `/research`.

## The loop

1. **Restate.** In one sentence, restate the question. If it's ambiguous,
   ask once and stop. Do not guess.
2. **Decompose.** List 2–5 sub-questions. This is your search plan.
3. **Check prior notes.** Call `list_notes()` with no topic to see what's
   already captured. If a relevant topic exists, `list_notes(topic)` and
   build on it instead of duplicating.
4. **For each sub-question:**
   a. `web_search` with a focused query.
   b. Pick the 1–3 most promising results. Skip obviously irrelevant ones.
   c. `fetch_source` each. Read carefully.
   d. For each discrete finding, call `add_note` — one claim per call —
      with the URLs you fetched as citations and a confidence level.
5. **Synthesize.** After all sub-questions are covered, write a narrative
   answer for the user. Reference findings inline (paraphrase the claim,
   don't dump URLs into the prose — the notes file has those).

## Citation discipline

- **Never** cite a URL you didn't `fetch_source`. A snippet from
  `web_search` is a lead, not a source.
- If two sources disagree, capture *both* as separate notes and flag the
  disagreement in your synthesis.
- If you can't find a good source for a claim, say so. Do not fill gaps
  with model priors and pretend they're research.

## Confidence calibration

| Level | Meaning |
|---|---|
| `high` | Two or more independent, reputable sources agree. |
| `medium` | One solid source; not contradicted. |
| `low` | Suggestive evidence, single weak source, or inference from adjacent facts. |

If a claim would be `low` confidence, ask yourself whether it belongs in
the notes at all. It usually does — but the confidence field must be
honest.

## Stop conditions

- User's question is ambiguous → ask, don't guess.
- After 20 `add_note` calls in one session → pause and check with the
  user before continuing (sanity ceiling).
- If `web_search` returns no results for a query, reformulate once; if
  still nothing, say so and move on.

## What not to do

- Don't summarize source snippets without fetching. Snippets are search
  bait, not evidence.
- Don't turn a research session into a code session. If the user needs
  code, tell them to use the coding harness.
