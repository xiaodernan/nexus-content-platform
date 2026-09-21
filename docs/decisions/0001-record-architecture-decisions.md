# 0001 — Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-09-22

## Context
NEXUS is a long-lived, multi-agent system that will be built and modified heavily by AI
agents as well as humans (spec §78). Without a durable record of *why* the system is
shaped the way it is, agents will re-litigate settled decisions or silently violate them.

## Decision
Maintain lightweight Architecture Decision Records (ADRs) in `docs/decisions/`, one
numbered Markdown file per decision, indexed in `README.md`.

## Options
- A. ADRs in Markdown in-repo (this choice).
- B. Decisions only in the README / chat history.
- C. A heavyweight external decision tool.

## Choice
A.

## Reason
In-repo Markdown version with the code, is diffable, reviewable, and directly readable by
agents via the Context Engine. No new infrastructure needed at Milestone 0.

## Tradeoffs
- (+) Zero extra tooling; versioned with code; citable by path.
- (−) Discipline required to actually write them; risk of drift if not linked from code. Mitigated: `DECISIONS` doc + CI check that `docs/decisions/README.md` index lists every ADR file.
