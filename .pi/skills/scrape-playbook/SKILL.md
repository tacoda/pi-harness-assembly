---
name: scrape-playbook
description: Web scraping loop (probe → fetch → identify entity → extract with `save_record` → paginate) using `fetch_url` and `save_record`. Load when the user asks to scrape, extract, or collect data from a web page, or when `/scrape` is invoked.
---

# scrape-playbook

Load this skill whenever the user asks to scrape, extract, or collect data
from a web page. Also loaded automatically by the `/scrape` command.

## The loop

For each target URL:

1. **Probe** with `fetch_url(url, mode='headers')` first if you suspect
   the URL might be a redirect, a login wall, or a non-HTML resource.
   Skip this step for obviously public HTML pages.
2. **Fetch** with `mode='text'` unless you need structural cues (tables,
   nested lists, data-attributes) — then use `mode='html'`.
3. **Identify** the repeating entity. Say what it is out loud in one
   sentence before you start extracting ("this page is a list of job
   postings; each has a title, company, location, and posted date").
4. **Extract** one entity at a time. For each: call `save_record` with a
   normalized object.
5. **Paginate** if the page shows there's a next page. Follow the "next"
   link (never guess `?page=N` unless you've seen the pattern in the
   HTML). Cap yourself at 5 pages unless the user asked for more.
6. **Report** at the end: `saved N records to <collection>`.

## Record schema hygiene

Every record must include at minimum:

- `source_url` — the URL you extracted it from (post-redirect).
- `extracted_at` — ISO 8601 timestamp. (The tool adds `ts` automatically,
  but include your own field too for downstream clarity.)

Beyond that, keep field names snake_case and stable across records in the
same collection.

## Stop conditions

Stop immediately and report to the user if:

- `fetch_url` returns 401, 403, 429, or 5xx.
- The page content looks like a bot-check / CAPTCHA / login wall.
- You've extracted >200 records in one session (sanity ceiling).
- The user's intent is ambiguous — ask, don't guess.

## What not to do

- Do not attempt to bypass rate limits with fake user agents.
- Do not spider off the target domain unless the user explicitly asked.
- Do not extract PII (emails, phone numbers, names of private
  individuals) unless the user's request is explicitly about that.
