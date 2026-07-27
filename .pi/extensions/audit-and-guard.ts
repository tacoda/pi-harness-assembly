/**
 * Case 1 — Regulated shop guardrails.
 *
 * Strategy D (tool gate). Does three things:
 *   1. Appends every tool call to .pi/audit.log with a timestamp, tool name,
 *      and a compact JSON of the input. This is the artifact an auditor will
 *      ask for.
 *   2. Hard-blocks writes/edits to protected paths (secrets, prod config).
 *   3. Requires a human confirmation before destructive bash commands run,
 *      even if the model is confident.
 *
 * Nothing here touches pi internals; it's a single event handler + a tool
 * gate. Removing this file reverts pi to stock behavior.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const AUDIT_LOG = resolve(process.cwd(), ".pi/audit.log");

const PROTECTED_PATH_PATTERNS = [
	/(^|\/)\.env(\..+)?$/,
	/(^|\/)secrets\//,
	/(^|\/)config\/prod\//,
];

const DESTRUCTIVE_BASH_PATTERNS = [
	/\brm\s+(-[a-z]*r[a-z]*f?|-[a-z]*f[a-z]*r|--recursive)/i,
	/\bsudo\b/i,
	/\b(chmod|chown)\b.*777/i,
	/\bmv\s+.*\s+\/(?!tmp\/)/i, // moving into root
	/>\s*\/dev\/sd[a-z]/i,
	/\bdd\s+.*of=\/dev\//i,
	/\bcurl\b.*\|\s*(bash|sh)/i,
];

function audit(entry: Record<string, unknown>) {
	try {
		mkdirSync(dirname(AUDIT_LOG), { recursive: true });
		appendFileSync(
			AUDIT_LOG,
			JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n",
		);
	} catch {
		// audit failures must never crash the agent; they surface in the UI below.
	}
}

function isProtected(path: string | undefined): boolean {
	if (!path) return false;
	return PROTECTED_PATH_PATTERNS.some((p) => p.test(path));
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (ctx.hasUI) {
			ctx.ui.notify(
				`compliance mode: audit → ${AUDIT_LOG}`,
				"info",
			);
		}
		audit({ event: "session_start", cwd: process.cwd() });
	});

	pi.on("tool_call", async (event, ctx) => {
		// 1. Audit everything, always. Truncate input to keep the log readable.
		const inputStr = JSON.stringify(event.input);
		audit({
			event: "tool_call",
			tool: event.toolName,
			input:
				inputStr.length > 500 ? inputStr.slice(0, 500) + "…" : inputStr,
		});

		// 2. Protected path enforcement.
		if (event.toolName === "write" || event.toolName === "edit") {
			const path = event.input.path as string | undefined;
			if (isProtected(path)) {
				audit({ event: "blocked", reason: "protected_path", path });
				if (ctx.hasUI) {
					ctx.ui.notify(
						`blocked: ${path} is a protected path`,
						"warning",
					);
				}
				return {
					block: true,
					reason: `Path "${path}" is protected by compliance policy. If this is intentional, the user must edit the file directly outside the agent.`,
				};
			}
		}

		// 3. Destructive bash confirmation.
		if (event.toolName === "bash") {
			const command = (event.input.command as string) ?? "";
			const isDangerous = DESTRUCTIVE_BASH_PATTERNS.some((p) =>
				p.test(command),
			);
			if (isDangerous) {
				if (!ctx.hasUI) {
					audit({
						event: "blocked",
						reason: "destructive_no_ui",
						command,
					});
					return {
						block: true,
						reason:
							"Destructive command blocked in non-interactive mode.",
					};
				}
				const choice = await ctx.ui.select(
					`⚠ destructive command\n\n  ${command}\n\nallow?`,
					["No", "Yes"],
				);
				if (choice !== "Yes") {
					audit({
						event: "blocked",
						reason: "destructive_user_denied",
						command,
					});
					return { block: true, reason: "Blocked by user" };
				}
				audit({
					event: "allowed",
					reason: "destructive_user_confirmed",
					command,
				});
			}
		}

		return undefined;
	});
}
