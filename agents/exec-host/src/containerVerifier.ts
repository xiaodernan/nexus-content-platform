import type { BuildVerifier } from '@nexus/agent-runtime';
import type { ContainerHost } from './containerExec.js';

/**
 * M6 v173 (ADR 0016 amendment 173): the CONTAINER verifier — the first production
 * `BuildVerifier`, and the first wired runner for the build lane. The dependency
 * direction stays legal (am.167): exec-host may depend on @nexus/agent-runtime; the
 * runtime itself holds only the SEAM (`buildArc.ts`) and zero execution capability.
 *
 * What this adapter adds — and all it adds: the arc's verify steps run INSIDE the
 * policy-pinned container through the SAME `planContainerRun` every container exec
 * uses (v166's wall — image pin, mount-free argv, egress denied, CPU/memory/PID caps,
 * read-only rootfs, plan budgets). Nothing new is trusted here and nothing here can
 * widen the plan: the request names only argv and a relative workdir, exactly as the
 * `container.exec` door's request does.
 *
 * `preApproved: true` is v30's rule restated, not an escape hatch: the §28 gate already
 * fired ONE layer up, on the registry's `build.verify` door — the human approved THIS
 * argv under THIS callId (`<arcId>:<stepId>`), so asking again here would be a second,
 * unelected gate. The callId keeps the receipt joinable to the arc step that asked.
 */
export interface ContainerVerifierOptions {
  /** The engine name the answers carry; default derived from the pinned policy image. */
  engine?: string;
}

export function containerVerifyRunner(host: ContainerHost, options: ContainerVerifierOptions = {}): BuildVerifier {
  const engine = options.engine ?? `container:${host.policy.image}`;
  return async (request) => {
    const result = await host.run(
      { argv: request.argv, ...(request.cwd === undefined ? {} : { cwd: request.cwd }) },
      { preApproved: true, callId: `${request.arcId}:${request.stepId}` },
    );
    // A refusal that never ran is the ASK's: the policy or the §28 gate said no before the client
    // was summoned, and a refused ask is the caller's to see. A client that could not START is the
    // MACHINE's: the ask was fine and this door could not perform it — so the kind rides the answer
    // and the door above answers 503 instead of reading it as a step that verified bad.
    if (!result.ran) return { ok: false, detail: result.reason, engine };
    if (result.spawnError !== '') return { ok: false, detail: `docker client failed: ${result.spawnError}`, engine, failure: 'the-machine' };
    const ok = result.exitCode === 0 && !result.killedByBudget;
    const detail = `container ${result.image} ${result.argv.join(' ')} → exit ${result.exitCode}${result.killedByBudget ? ' (killed at timeout budget)' : ''}${result.truncated ? ` (output truncated${result.truncatedStreams && result.truncatedStreams.length > 0 ? `: ${result.truncatedStreams.join(' + ')}` : ''})` : ''}`;
    return { ok, detail, engine, ...(result.stdout === '' ? {} : { stdout: result.stdout }) };
  };
}
