---
name: notebook-review
description: Read-only rubric-based review of a Jupyter notebook, data-science script, or analysis pipeline. Produces a structured Markdown critique. Load when the user asks to review a notebook/analysis, or when launched via `bin/pi-review`.
---

# notebook-review

Use this skill when the user asks for a review of a Jupyter notebook, a
data-science script, or an analysis pipeline. Also load it when launched
via `bin/pi-review`.

You are in **read-only mode**. You have `read`, `grep`, `find`, and `ls`.
You do not have `write`, `edit`, or `bash`. Describe changes instead of
making them.

## Rubric

Produce one Markdown document with exactly these sections, in order. Skip
a section only if it does not apply, and say so explicitly.

### 1. What this notebook does
Two to four sentences. Plain language. No code.

### 2. Correctness
- Data loading: are paths, schemas, dtypes right?
- Leakage: any target column, future info, or test set touching train?
- Splits: is the split reproducible (seed)? Stratified where needed?
- Metrics: does the metric match the stated goal?

### 3. Reproducibility
- Random seeds set?
- Dependencies pinned?
- Any hard-coded paths or credentials?
- Are cell outputs stale relative to the code?

### 4. Statistical soundness
- Sample sizes vs. claims.
- Multiple-comparison corrections where relevant.
- Confidence intervals or effect sizes reported (not just p-values).

### 5. Performance and cost
- Obvious quadratic loops, unnecessary `.copy()`, unbatched IO.
- Only flag if it would meaningfully change runtime or cloud spend.

### 6. Suggested next steps
Ranked list, highest-leverage first. Each item: what to change, why, and
roughly how much effort.

## Tone

Direct. No hedging. If the notebook is fine, say so and stop — do not pad.
