/**
 * Case 4 — Web scraping harness.
 *
 * This is the interesting case: pi is *nominally* a coding agent, but the
 * only coding-specific parts are (a) the built-in tools (read/write/edit/
 * bash) and (b) the default system prompt. Both are replaceable. The
 * harness — loop, TUI, sessions, providers, compaction — is domain
 * agnostic.
 *
 * Here we register scraping-shaped tools. Combined with .pi/SYSTEM.md
 * (which reframes the agent's identity) and bin/pi-scrape (which launches
 * with --no-builtin-tools so read/write/edit/bash are gone), pi becomes a
 * scraping agent. Nothing was forked; no internals were touched.
 *
 * The tools are intentionally dependency-free: node's built-in fetch, plus
 * a minimal HTML→text pass. A real deployment would add cheerio or
 * playwright, but the shape of the extension stays the same.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const OUT_DIR = resolve(process.cwd(), "scrape-output");
const MAX_BYTES = 200_000; // cap per fetch to keep context sane

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

function truncate(s: string): { body: string; truncated: boolean } {
	if (s.length <= MAX_BYTES) return { body: s, truncated: false };
	return { body: s.slice(0, MAX_BYTES) + "…[truncated]", truncated: true };
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "fetch_url",
		label: "Fetch URL",
		description:
			"HTTP GET a URL and return response. Use mode='text' for stripped/normalized text (best for extraction reasoning), 'html' for raw markup (best when structure matters), or 'headers' to just inspect status and content-type without a body.",
		parameters: Type.Object({
			url: Type.String({ description: "Absolute URL, http(s) only." }),
			mode: Type.Union(
				[Type.Literal("text"), Type.Literal("html"), Type.Literal("headers")],
				{ description: "Response processing mode." },
			),
			user_agent: Type.Optional(
				Type.String({ description: "Override User-Agent header." }),
			),
		}),
		async execute(_id, params, signal, _onUpdate, _ctx) {
			if (!/^https?:\/\//i.test(params.url)) {
				return {
					content: [{ type: "text", text: `error: url must be http(s)` }],
					details: { error: "bad_scheme" },
				};
			}
			const res = await fetch(params.url, {
				signal,
				redirect: "follow",
				headers: {
					"User-Agent":
						params.user_agent ?? "pi-scrape/0.1 (+harness-test)",
					Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				},
			});
			const status = res.status;
			const finalUrl = res.url;
			const contentType = res.headers.get("content-type") ?? "";

			if (params.mode === "headers") {
				return {
					content: [
						{
							type: "text",
							text: `HTTP ${status} ${finalUrl}\ncontent-type: ${contentType}`,
						},
					],
					details: { status, finalUrl, contentType },
				};
			}

			const raw = await res.text();
			const body =
				params.mode === "text" ? htmlToText(raw) : raw;
			const { body: capped, truncated } = truncate(body);

			return {
				content: [
					{
						type: "text",
						text: `HTTP ${status} ${finalUrl}\ncontent-type: ${contentType}\n\n${capped}`,
					},
				],
				details: {
					status,
					finalUrl,
					contentType,
					bytes: body.length,
					truncated,
				},
			};
		},
	});

	pi.registerTool({
		name: "save_record",
		label: "Save record",
		description:
			"Append one JSON record to scrape-output/<collection>.jsonl. Use this for every extracted entity (product, listing, article, etc.). One call per record — do not batch.",
		parameters: Type.Object({
			collection: Type.String({
				description:
					"Collection name, e.g. 'products'. Becomes the filename.",
			}),
			record: Type.Record(Type.String(), Type.Any(), {
				description: "The extracted entity as a JSON object.",
			}),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const safe = params.collection.replace(/[^a-zA-Z0-9._-]/g, "_");
			const path = resolve(OUT_DIR, `${safe}.jsonl`);
			mkdirSync(dirname(path), { recursive: true });
			const line =
				JSON.stringify({
					ts: new Date().toISOString(),
					...params.record,
				}) + "\n";
			appendFileSync(path, line);
			if (ctx.hasUI) ctx.ui.notify(`+ ${safe}: ${Object.keys(params.record).join(",")}`, "info");
			return {
				content: [{ type: "text", text: `saved to ${path}` }],
				details: { path, collection: safe },
			};
		},
	});

	pi.registerCommand("scrape", {
		description: "Start a scrape. Usage: /scrape <url> [what to extract]",
		handler: async (args, ctx) => {
			const trimmed = args?.trim() ?? "";
			if (!trimmed) {
				ctx.ui.notify("usage: /scrape <url> [what to extract]", "warning");
				return;
			}
			ctx.sendUserMessage(
				`Scrape target: ${trimmed}\n\nFollow the scrape-playbook skill. Fetch the URL, identify the entities, extract them, and save one record per entity with save_record. Report a count at the end.`,
			);
		},
	});
}
