# 0008 — Design tokens in W3C DTCG format

- **Status:** Accepted
- **Date:** 2026-09-22

## Context
Every project may carry a Design System (§10): colors, typography, spacing, radius, shadows,
motion, components, icons, breakpoints. AI-generated UI must *consume* the system
automatically, so tokens need a machine-readable, interoperable standard — not a bespoke
shape that only our code understands.

## Decision
Adopt the **W3C Design Tokens Community Group (DTCG) Format Module** (first stable, 2025.10)
as the canonical token file format. Tokens are stored as DTCG JSON in the Design Model
(ADR 0004), with `color`, `dimension`, `typography`, `shadow`, `duration`, and
`$extensions` for Nexus-specific metadata (e.g. `nexus.category`). A build step compiles
DTCG → CSS custom properties + Tailwind theme + a TS constant map, so both the canvas and
generated code consume the *same* values.

## Options
- **DTCG JSON** (this choice) — emerging standard, tool-supported, provider-neutral.
- Style Dictionary legacy JSON — popular but pre-standard; DTCG supersedes it.
- Tailwind config as source of truth — locks semantics to one framework, fails §10's
  "AI consumes design system" neutrality and cross-runtime (Three.js, generated code) needs.

## Reason
Using the standards-track format means future importers/exporters (Figma, Tokens Studio,
Penpot) and our own code-gen interoperate without lossy adapters, and Tailwind/CodeLayers/
3D materials all read the same token values — the "maintain project visual identity"
requirement in §19 depends on it.

## Tradeoffs
- (−) DTCG is recent; some tooling still emits legacy format. Mitigated: accept both on
  import, always emit DTCG.
