/**
 * Case 2 — Platform team deploy workflow.
 *
 * Strategy E (custom tool + custom command).
 *
 *   - Registers a `deploy_service` tool the model can call. This is where a
 *     real org would shell out to their internal CLI (kubectl, spinnaker,
 *     argo, custom). Here we stub it so the case is runnable end-to-end.
 *   - Registers a `/deploy` command so a human can start the workflow with
 *     one keystroke; it expands the deploy prompt template and hands off to
 *     the model, which then loads the deploy-runbook skill.
 *
 * The skill (see .pi/skills/deploy-runbook/SKILL.md) contains the actual
 * playbook. Keeping the playbook in Markdown means non-engineers on the
 * platform team can edit it without touching TypeScript.
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Stage = "preflight" | "canary" | "verify" | "promote";
type Env = "staging" | "prod";

function simulate(service: string, env: Env, stage: Stage): string {
	// Replace with a real exec (spinnaker, argo, kubectl, internal CLI).
	// For the purposes of this test the tool is deterministic and side-effect
	// free so the case is safe to run in CI.
	switch (stage) {
		case "preflight":
			return `preflight ok: ${service} → ${env} (image built, tests green, migrations noop)`;
		case "canary":
			return `canary ok: 5% traffic to ${service} in ${env}, error rate 0.02%, p95 118ms`;
		case "verify":
			return `verify ok: SLOs green for 3m on ${service}/${env}`;
		case "promote":
			return `promote ok: 100% traffic to ${service} in ${env}`;
	}
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "deploy_service",
		label: "Deploy service",
		description:
			"Run one stage of the canonical deploy pipeline for a service. Stages must be run in order: preflight → canary → verify → promote. Do not skip stages. Do not run promote until verify has passed on the same (service, env) within the current session.",
		parameters: Type.Object({
			service: Type.String({ description: "Service name, e.g. 'checkout'." }),
			env: Type.Union([Type.Literal("staging"), Type.Literal("prod")], {
				description: "Target environment.",
			}),
			stage: Type.Union(
				[
					Type.Literal("preflight"),
					Type.Literal("canary"),
					Type.Literal("verify"),
					Type.Literal("promote"),
				],
				{ description: "Which pipeline stage to run." },
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const line = simulate(params.service, params.env, params.stage);
			return {
				content: [{ type: "text", text: line }],
				details: { service: params.service, env: params.env, stage: params.stage },
			};
		},
	});

	pi.registerCommand("deploy", {
		description: "Start a canonical deploy. Loads the deploy-runbook skill.",
		handler: async (args, ctx) => {
			// The command just hands a well-formed prompt to the model. The
			// skill in .pi/skills/deploy-runbook/ is what actually drives it.
			const target = args?.trim() || "(ask user which service and env)";
			ctx.sendUserMessage(
				`Deploy: ${target}\n\nLoad the deploy-runbook skill and follow it exactly. Use the deploy_service tool for every stage. Stop and ask me before running 'promote' to prod.`,
			);
		},
	});
}
