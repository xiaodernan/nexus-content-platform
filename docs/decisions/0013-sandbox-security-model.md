# 0013 — Sandbox & security model (forward-looking, not yet built)

- **Status:** Proposed
- **Date:** 2026-09-22

## Context
§28 forbids running untrusted generated code on the host. §34 requires human checkpoints
before destructive/paid/public actions. §54 lists auth/RBAC/rate-limiting/XSS/CSRF/SSRF and
secret isolation. Recorded now so the Studio and services never accidentally violate it, even
though enforcement lands in Milestone 2+.

## Decision (proposed)
- Generated code executes in **ephemeral containers** (Docker, later gVisor/Firecracker) with
  no host FS access, CPU/mem caps, wall-clock timeout, default-deny egress network policy, and
  secrets injected per-job from `services/ai-svc` — never the browser.
- **Tool Registry** (§27) gates every tool by a declared permission scope; the orchestrator
  (§23) checks grants before invocation and routes high-risk tools (deploy, publish, spend,
  delete, external-send) through a **Human Checkpoint** (§34) that blocks until approval.
- Web layer: HttpOnly SameSite cookies, CSRF tokens on mutations, CSP, SSRF allow-listing for
  the browser/research fetchers, output encoding for user-generated HTML (XSS).

## Why "Proposed"
Milestone 0/1 executes nothing untrusted (Studio is a client-side design editor + DEMO
provider), so there is no untrusted-code path to sandbox yet. Documented up front so the
agentic-coding milestone implements it rather than retrofitting.

> **Update (2026-09, v29 + v30):** the first two portable slices have landed.
> `agents/runtime/src/execSandbox.ts` (ADR 0016 amendment 29) implements the default-deny
> argv allowlist, bare-name executables, jail-confined cwd, env scrubbing and capped
> budgets, and `planExec` emits only INERT plans (`executes: false` in the type).
> `agents/exec-host` (amendment 30) adds the confined executor: the ONLY module in the
> agent stack that names `child_process` (audited both ways by `exec-host-proof.mjs`),
> which runs nothing but a policy-approved plan, under the §28 checkpoint, with the
> plan's own timeout/output budgets enforced and `shell: false`. What still keeps this ADR
> **Proposed**: ephemeral containers/gVisor, default-deny EGRESS network policy, per-job
> secret injection from `services/ai-svc`, and warm-pool queueing — none of which exist or
> are reachable from a key-free, browser-first repo. The host here is a POLICY sandbox,
> not an OS sandbox; untrusted code still has nowhere to run (§28 + exact-argv are the
> containment until containers do).

## Tradeoffs
- (−) Container cold-start latency per job; mitigated by a warm pool in Redis-backed queue.
