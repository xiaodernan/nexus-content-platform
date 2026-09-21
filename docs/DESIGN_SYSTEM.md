# Design System & Design Model

The **Nexus Design Model** (ADR 0004) is the canonical representation; raw DOM is never the
source of truth. Node kinds: `Document, Page, Frame, Node(rect/ellipse/line/path),
Text, Component, Instance, Variant, Token, Asset, Interaction, Animation`, plus responsive
rules. Stored as a normalized `Map<id, node>` with ordered `childIds`.

**Tokens** follow the W3C **DTCG** format (ADR 0008): colors, typography, spacing, radius,
shadows, motion, breakpoints, icons. A compile step produces CSS custom properties, a
Tailwind theme, and a TS map so the canvas renderer and generated code consume identical
values (maintains visual identity, §19).

- **Built:** token model + a default theme in `packages/design-model`; AI output consumes it.
- **Deferred:** token theming UI, component-variant authoring UI, DTCG import/export.
