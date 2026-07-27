/**
 * Case 5 — Research assistant harness.
 *
 * Second non-coding domain. Where the scraping harness (Case 4) extracts
 * structured records from known URLs, the research assistant *discovers*
 * sources, reads them, and synthesizes findings with citations.
 *
 * Tools:
 *   - web_search(query)    → list of candidate sources (title, url, snippet)
 *   - fetch_source(url)    → readable text of a URL
 *   - add_note(topic, ...) → append a finding with citations to
 *                            research-notes/<topic>.md
 *   - list_notes(topic?)   → read back what's already been captured
 *
 * `web_search` is backed by Wikipedia's opensearch API here — it's
 * dependency-free and requires no key, which keeps the case runnable out
 * of the box. In a real deployment you'd swap in Brave Search, Serper,
 * Kagi, or Tavily. The shape of the extension does not change.
 */

import { appendFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const NOTES_DIR = resolve(process.cwd(), "research-notes");
const MAX_FETCH_BYTES = 200_000;

function slug(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 64) || "untitled";
}

function htmlToText(html: string): string {
	return html
		.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
		.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\s+/g, " ")
		.trim();
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "web_search",
		label: "Web search",
		description:
			"Search for sources on a topic. Returns a list of candidate results with title, url, and short snippet. Backed by Wikipedia opensearch in this harness — good for encyclopedic and definitional queries, less good for news or primary sources. Use fetch_source to actually read a result.",
		parameters: Type.Object({
			query: Type.String({ description: "Search query. Keep it under 10 words." }),
			limit: Type.Optional(
				Type.Integer({
					minimum: 1,
					maximum: 20,
					description: "Max results, default 8.",
				}),
			),
		}),
		async execute(_id, params, signal, _onUpdate, _ctx) {
			const limit = params.limit ?? 8;
			const url = `https://en.wikipedia.org/w/api.php?action=opensearch&limit=${limit}&format=json&search=${encodeURIComponent(params.query)}`;
			const res = await fetch(url, {
				signal,
				headers: { "User-Agent": "pi-research/0.1 (+harness-test)" },
			});
			if (!res.ok) {
				return {
					content: [{ type: "text", text: `search failed: HTTP ${res.status}` }],
					details: { error: `http_${res.status}` },
				};
			}
			// opensearch returns [query, [titles], [snippets], [urls]]
			const data = (await res.json()) as [string, string[], string[], string[]];
			const [, titles, snippets, urls] = data;
			const results = titles.map((title, i) => ({
				title,
				url: urls[i],
				snippet: snippets[i],
			}));
			const text = results.length
				? results
						.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
						.join("\n\n")
				: "(no results)";
			return {
				content: [{ type: "text", text }],
				details: { query: params.query, count: results.length, results },
			};
		},
	});

	pi.registerTool({
		name: "fetch_source",
		label: "Fetch source",
		description:
			"Fetch a URL and return its readable text content. Use this to read a search result in full before citing it. HTML is stripped and normalized. Large pages are truncated.",
		parameters: Type.Object({
			url: Type.String({ description: "Absolute http(s) URL." }),
		}),
		async execute(_id, params, signal, _onUpdate, _ctx) {
			if (!/^https?:\/\//i.test(params.url)) {
				return {
					content: [{ type: "text", text: "error: url must be http(s)" }],
					details: { error: "bad_scheme" },
				};
			}
			const res = await fetch(params.url, {
				signal,
				redirect: "follow",
				headers: { "User-Agent": "pi-research/0.1 (+harness-test)" },
			});
			const raw = await res.text();
			const text = htmlToText(raw);
			const truncated = text.length > MAX_FETCH_BYTES;
			const body = truncated
				? text.slice(0, MAX_FETCH_BYTES) + "…[truncated]"
				: text;
			return {
				content: [
					{
						type: "text",
						text: `HTTP ${res.status} ${res.url}\n\n${body}`,
					},
				],
				details: {
					status: res.status,
					finalUrl: res.url,
					bytes: text.length,
					truncated,
				},
			};
		},
	});

	pi.registerTool({
		name: "add_note",
		label: "Add research note",
		description:
			"Append a finding to research-notes/<topic>.md. A note is one discrete claim or observation with at least one citation. Do not batch multiple findings into one note — one claim per call. Citations must be URLs you actually fetched with fetch_source.",
		parameters: Type.Object({
			topic: Type.String({
				description:
					"Topic slug, e.g. 'transformer-architectures'. Notes on the same topic accumulate in the same file.",
			}),
			claim: Type.String({
				description:
					"One-sentence finding. Precise and self-contained; a reader should not need the surrounding notes to understand it.",
			}),
			detail: Type.Optional(
				Type.String({
					description:
						"Optional supporting paragraph. Numbers, quotes, context. Keep under ~150 words.",
				}),
			),
			citations: Type.Array(Type.String(), {
				minItems: 1,
				description:
					"URLs supporting the claim. At least one. Must be URLs you have actually fetched.",
			}),
			confidence: Type.Union(
				[Type.Literal("high"), Type.Literal("medium"), Type.Literal("low")],
				{ description: "Your confidence in this claim given the sources." },
			),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const topic = slug(params.topic);
			const path = resolve(NOTES_DIR, `${topic}.md`);
			mkdirSync(dirname(path), { recursive: true });
			const isNew = !existsSync(path);
			const ts = new Date().toISOString();
			const cites = params.citations
				.map((c, i) => `[${i + 1}] ${c}`)
				.join("\n");
			const block = [
				isNew ? `# ${params.topic}\n` : "",
				`## ${ts}  \`${params.confidence}\``,
				"",
				params.claim,
				params.detail ? `\n${params.detail}` : "",
				"",
				cites,
				"\n",
			]
				.filter(Boolean)
				.join("\n");
			appendFileSync(path, block);
			if (ctx.hasUI) {
				ctx.ui.notify(
					`+ note (${params.confidence}) → ${topic}.md`,
					"info",
				);
			}
			return {
				content: [{ type: "text", text: `saved to ${path}` }],
				details: { path, topic, confidence: params.confidence },
			};
		},
	});

	pi.registerTool({
		name: "list_notes",
		label: "List notes",
		description:
			"Read back research notes previously captured. Pass a topic slug to read one file, or omit to list all topics. Use this before starting new research to avoid duplicating work.",
		parameters: Type.Object({
			topic: Type.Optional(
				Type.String({
					description: "Topic slug. Omit to list all topics.",
				}),
			),
		}),
		async execute(_id, params, _signal, _onUpdate, _ctx) {
			if (!existsSync(NOTES_DIR)) {
				return {
					content: [{ type: "text", text: "(no notes yet)" }],
					details: { topics: [] },
				};
			}
			if (params.topic) {
				const path = resolve(NOTES_DIR, `${slug(params.topic)}.md`);
				if (!existsSync(path)) {
					return {
						content: [{ type: "text", text: `(no notes for ${params.topic})` }],
						details: { topic: params.topic, found: false },
					};
				}
				const body = readFileSync(path, "utf8");
				return {
					content: [{ type: "text", text: body }],
					details: { topic: params.topic, found: true, path },
				};
			}
			const topics = readdirSync(NOTES_DIR)
				.filter((f) => f.endsWith(".md"))
				.map((f) => f.replace(/\.md$/, ""));
			const text = topics.length
				? `topics:\n${topics.map((t) => `- ${t}`).join("\n")}`
				: "(no notes yet)";
			return {
				content: [{ type: "text", text }],
				details: { topics },
			};
		},
	});

	pi.registerCommand("research", {
		description: "Start a research task. Usage: /research <question>",
		handler: async (args, ctx) => {
			const q = args?.trim();
			if (!q) {
				ctx.ui.notify("usage: /research <question>", "warning");
				return;
			}
			ctx.sendUserMessage(
				`Research question: ${q}\n\nFollow the research-playbook skill. First, check list_notes for any prior work on this topic. Then search, read, and take notes. Every claim gets at least one citation. End with a synthesis.`,
			);
		},
	});
}
