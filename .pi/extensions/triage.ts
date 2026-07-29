/**
 * Case 6 — Log-triage harness.
 *
 * Third non-coding domain. Where scraping (Case 4) extracts records from
 * the web and research (Case 5) synthesizes cited notes, this harness
 * reads a directory of log files, classifies events, and saves incident
 * records.
 *
 * The interesting bit isn't the domain — it's the deployment shape. This
 * harness is meant to be run *inside a Docker container* (see
 * `docker/Dockerfile` and `bin/pi-triage`). The container:
 *   - has no shell or coding tools available to the model
 *     (`--no-builtin-tools`),
 *   - only sees the log directory mounted read-only at `/logs`,
 *   - writes incidents to `/work/triage-output/` on a mounted volume,
 *   - runs as a non-root user.
 *
 * The extension itself doesn't know or care that it's containerized. It
 * just refuses to look outside `LOGS_DIR`. Docker is the outer belt; the
 * tool-level path guard is the inner belt.
 *
 * Tools:
 *   - list_logs()                    → files under LOGS_DIR
 *   - read_log(path, tail?)          → contents (last N lines by default)
 *   - grep_logs(pattern, path?)      → regex across logs
 *   - save_incident(record)          → append to triage-output/incidents.jsonl
 */

import { appendFileSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// LOGS_DIR is where the mounted read-only volume lives inside the container.
// Override with TRIAGE_LOGS_DIR for local (non-Docker) testing.
const LOGS_DIR = resolve(process.env.TRIAGE_LOGS_DIR ?? "/logs");
const OUT_DIR = resolve(process.cwd(), "triage-output");
const MAX_READ_BYTES = 200_000;

function insideLogsDir(p: string): boolean {
	const abs = resolve(LOGS_DIR, p);
	const rel = relative(LOGS_DIR, abs);
	return !rel.startsWith("..") && !rel.startsWith("/");
}

function walk(dir: string, out: string[] = []): string[] {
	let entries: import("node:fs").Dirent[];
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const e of entries) {
		const full = resolve(dir, e.name);
		if (e.isDirectory()) walk(full, out);
		else if (e.isFile()) out.push(full);
	}
	return out;
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "list_logs",
		label: "List logs",
		description:
			"List every log file visible under the mounted logs directory. Returns relative paths, sizes, and mtimes.",
		parameters: Type.Object({}),
		async execute(_id, _params, _signal, _onUpdate, _ctx) {
			const files = walk(LOGS_DIR).map((f) => {
				const st = statSync(f);
				return {
					path: relative(LOGS_DIR, f),
					bytes: st.size,
					mtime: st.mtime.toISOString(),
				};
			});
			const summary = files
				.map((f) => `${f.path}\t${f.bytes}B\t${f.mtime}`)
				.join("\n");
			return {
				content: [
					{
						type: "text",
						text: files.length
							? `${files.length} file(s) under ${LOGS_DIR}:\n${summary}`
							: `no files under ${LOGS_DIR}`,
					},
				],
				details: { root: LOGS_DIR, files },
			};
		},
	});

	pi.registerTool({
		name: "read_log",
		label: "Read log",
		description:
			"Read a log file from the mounted logs directory. By default returns the last `tail` lines (default 500). Refuses paths outside the logs root.",
		parameters: Type.Object({
			path: Type.String({
				description: "Path relative to the logs root, e.g. 'app/api.log'.",
			}),
			tail: Type.Optional(
				Type.Number({
					description: "How many trailing lines to return. Default 500.",
				}),
			),
		}),
		async execute(_id, params, _signal, _onUpdate, _ctx) {
			if (!insideLogsDir(params.path)) {
				return {
					content: [
						{ type: "text", text: `error: path escapes logs root` },
					],
					details: { error: "path_escape" },
				};
			}
			const abs = resolve(LOGS_DIR, params.path);
			let raw: string;
			try {
				raw = readFileSync(abs, "utf8");
			} catch (e) {
				return {
					content: [{ type: "text", text: `error: ${(e as Error).message}` }],
					details: { error: "read_failed" },
				};
			}
			const tail = params.tail ?? 500;
			const lines = raw.split(/\r?\n/);
			const slice = lines.slice(Math.max(0, lines.length - tail));
			let body = slice.join("\n");
			let truncated = false;
			if (body.length > MAX_READ_BYTES) {
				body = body.slice(-MAX_READ_BYTES);
				truncated = true;
			}
			return {
				content: [
					{
						type: "text",
						text: `${params.path} (last ${slice.length}/${lines.length} lines${truncated ? ", byte-truncated" : ""})\n\n${body}`,
					},
				],
				details: {
					path: params.path,
					totalLines: lines.length,
					returnedLines: slice.length,
					truncated,
				},
			};
		},
	});

	pi.registerTool({
		name: "grep_logs",
		label: "Grep logs",
		description:
			"Regex-search across log files under the logs root. Returns up to 200 matches with file/line context.",
		parameters: Type.Object({
			pattern: Type.String({
				description: "JavaScript regex (without leading/trailing slashes).",
			}),
			path: Type.Optional(
				Type.String({
					description:
						"Optional subdir/file relative to logs root. Defaults to entire root.",
				}),
			),
			flags: Type.Optional(
				Type.String({ description: "Regex flags, default 'i'." }),
			),
		}),
		async execute(_id, params, _signal, _onUpdate, _ctx) {
			let re: RegExp;
			try {
				re = new RegExp(params.pattern, params.flags ?? "i");
			} catch (e) {
				return {
					content: [{ type: "text", text: `bad regex: ${(e as Error).message}` }],
					details: { error: "bad_regex" },
				};
			}
			const root = params.path
				? (insideLogsDir(params.path)
					? resolve(LOGS_DIR, params.path)
					: null)
				: LOGS_DIR;
			if (!root) {
				return {
					content: [{ type: "text", text: `error: path escapes logs root` }],
					details: { error: "path_escape" },
				};
			}
			const st = statSync(root);
			const files = st.isDirectory() ? walk(root) : [root];
			const matches: { path: string; line: number; text: string }[] = [];
			for (const f of files) {
				const rel = relative(LOGS_DIR, f);
				const lines = readFileSync(f, "utf8").split(/\r?\n/);
				for (let i = 0; i < lines.length; i++) {
					if (re.test(lines[i])) {
						matches.push({ path: rel, line: i + 1, text: lines[i].slice(0, 400) });
						if (matches.length >= 200) break;
					}
				}
				if (matches.length >= 200) break;
			}
			const text = matches.length
				? matches.map((m) => `${m.path}:${m.line}: ${m.text}`).join("\n")
				: `no matches for /${params.pattern}/${params.flags ?? "i"}`;
			return {
				content: [{ type: "text", text }],
				details: { count: matches.length, capped: matches.length >= 200 },
			};
		},
	});

	pi.registerTool({
		name: "save_incident",
		label: "Save incident",
		description:
			"Append one incident record to triage-output/incidents.jsonl. Call once per distinct incident. Include severity (info|warn|error|critical), a one-line summary, affected component, evidence (file:line references), and a suggested next action.",
		parameters: Type.Object({
			severity: Type.Union(
				[
					Type.Literal("info"),
					Type.Literal("warn"),
					Type.Literal("error"),
					Type.Literal("critical"),
				],
				{ description: "Severity band." },
			),
			summary: Type.String({ description: "One-line human summary." }),
			component: Type.String({
				description: "Which service/module this is about.",
			}),
			evidence: Type.Array(Type.String(), {
				description:
					"List of 'path:line' references from the logs supporting this incident.",
				minItems: 1,
			}),
			next_action: Type.String({
				description: "Suggested next step for a human on-call.",
			}),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const path = resolve(OUT_DIR, "incidents.jsonl");
			mkdirSync(dirname(path), { recursive: true });
			const line =
				JSON.stringify({
					ts: new Date().toISOString(),
					...params,
				}) + "\n";
			appendFileSync(path, line);
			if (ctx.hasUI)
				ctx.ui.notify(
					`+ ${params.severity}: ${params.summary}`,
					params.severity === "critical" || params.severity === "error"
						? "warning"
						: "info",
				);
			return {
				content: [{ type: "text", text: `saved incident to ${path}` }],
				details: { path, severity: params.severity },
			};
		},
	});

	pi.registerCommand("triage", {
		description:
			"Triage the mounted logs. Usage: /triage [focus] — optional focus like 'last hour' or 'auth service'.",
		handler: async (args, ctx) => {
			const focus = args?.trim() ?? "";
			ctx.sendUserMessage(
				`Triage the logs under the mounted logs directory.${focus ? ` Focus: ${focus}.` : ""}\n\nFollow the triage-playbook skill. List the logs, sample the recent tail of each, grep for error/exception/timeout/panic patterns, then save one incident record per distinct issue. Finish with a one-line summary of counts by severity.`,
			);
		},
	});
}
