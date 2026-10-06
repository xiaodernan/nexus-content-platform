/**
 * M2 v172 (ADR 0016 amendment 172): the SERVER half of the Studio dock's container lane.
 * The browser cannot hold docker — the one package allowed to spawn (@nexus/exec-host, the
 * v30 audit's whole answer) lives here, behind the Next route handler in
 * app/api/agent/container. The policy is PINNED as data: the image is node:22-alpine (the
 * same pin the v166 proof measured), the workdir root is the CONTAINER path /workspace, and
 * the allowlist is the minimum the dock needs to prove the lane alive — a node self-check.
 * There is no host-exec lane being migrated: the dock's exec door is BORN in the container,
 * so the §63-style duties of this product face never touch the host FS from day one.
 */
import {
  createContainerExecHost,
  probeContainerRuntime,
  validateContainerPolicy,
  type ContainerHost,
  type ContainerPolicy,
  type ContainerRunResult,
  type SpawnLike,
} from '@nexus/exec-host';

/** The ONE image this lane pins; the request can never name one (v166's rule, inherited). */
export const STUDIO_CONTAINER_IMAGE = 'node:22-alpine';
/** Container-side jail root; the request's cwd is a RELATIVE subpath of it. */
export const STUDIO_CONTAINER_WORKDIR_ROOT = '/workspace';

export const STUDIO_CONTAINER_POLICY: ContainerPolicy = {
  image: STUDIO_CONTAINER_IMAGE,
  workdirRoot: STUDIO_CONTAINER_WORKDIR_ROOT,
  allow: [
    { argv: ['node', '-e', '*'], timeoutMs: 15_000, maxOutputBytes: 16_384 },
    { argv: ['node', '--version'], timeoutMs: 10_000, maxOutputBytes: 1_024 },
  ],
  envAllow: [],
  maxTimeoutMs: 15_000,
  maxOutputBytes: 16_384,
};

export function studioContainerPolicyError(): string | null {
  return validateContainerPolicy(STUDIO_CONTAINER_POLICY);
}

/** A fresh host per call: stateless apart from a journal seq, and this lane keeps no journal. */
export function createStudioContainerHost(options: { spawnLike?: SpawnLike } = {}): ContainerHost {
  const err = studioContainerPolicyError();
  if (err) throw new Error(`studio container policy invalid: ${err}`);
  return createContainerExecHost(STUDIO_CONTAINER_POLICY, options);
}

/** What the dock's status line states: the probe's honest answer plus the pinned facts. */
export interface ContainerLaneState {
  available: boolean;
  serverVersion: string;
  reason: string;
  image: string;
  workdirRoot: string;
  rules: string[][];
}

export async function containerLaneState(options: { spawnLike?: SpawnLike } = {}): Promise<ContainerLaneState> {
  const probe = await probeContainerRuntime(options.spawnLike ? { spawnLike: options.spawnLike } : {});
  return {
    available: probe.available,
    serverVersion: probe.serverVersion,
    reason: probe.reason,
    image: STUDIO_CONTAINER_IMAGE,
    workdirRoot: STUDIO_CONTAINER_WORKDIR_ROOT,
    rules: STUDIO_CONTAINER_POLICY.allow.map((r) => [...r.argv]),
  };
}

export interface ContainerExecBody {
  argv?: unknown;
  cwd?: unknown;
  env?: unknown;
}

/**
 * The route's answer. A policy refusal is an HONEST answer (`ran: false` plus the stated
 * reason), never an error; only a malformed request is `ok: false`.
 */
export type ContainerExecAnswer =
  | { ok: false; reason: string }
  | { ok: true; ran: boolean; detail: string; result: ContainerRunResult };

export async function runContainerExec(body: unknown, options: { spawnLike?: SpawnLike } = {}): Promise<ContainerExecAnswer> {
  const input = (typeof body === 'object' && body !== null ? body : {}) as ContainerExecBody;
  if (!Array.isArray(input.argv) || input.argv.length === 0 || input.argv.some((t) => typeof t !== 'string' || t === '')) {
    return { ok: false, reason: 'argv must be a non-empty array of non-empty strings (no shell strings)' };
  }
  const host = createStudioContainerHost(options);
  // §28: the HUMAN gate for this route is the dock panel's Allow-once dialog — the panel calls
  // here only after the user allowed, so the route machine-approves. This is the dock
  // pipeline's own model (checkpoint: () => true; the panel is the checkpoint), stated rather
  // than assumed so the route never pretends a human looked at this exact call.
  const result = await host.run({ argv: input.argv as string[], cwd: input.cwd, env: input.env }, {
    checkpoint: () => true,
    callId: 'studio-dock-container-lane',
  });
  const detail = !result.ran
    ? result.reason
    : `container ${result.image} ${result.argv.join(' ')} → exit ${result.exitCode}${result.killedByBudget ? ' (killed at timeout budget)' : ''}${result.truncated ? ' (output truncated)' : ''}`;
  return { ok: true, ran: result.ran, detail, result };
}