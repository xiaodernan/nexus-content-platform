# 0003 — Frontend stack for the Studio

- **Status:** Accepted
- **Date:** 2026-09-22

## Context
The Studio (§6) is the central product and must feel like a native pro tool while living in
the browser. Spec §50 names the preferred stack.

## Options
- **Next.js (App Router) + React 19 + TypeScript + Tailwind v4 + shadcn/ui** (spec-preferred).
- Vite + React SPA — lighter, faster dev loop, but no SSR/SEO story for public artifacts (§48).
- Remix / SvelteKit / plain React.

## Decision
**Next.js App Router + React + TypeScript, Tailwind, shadcn/ui, Framer Motion** for the
Studio app (`apps/studio`). TypeScript `^5.7` pinned for ecosystem compatibility even
though TS 7 is available.

## Reason
- SEO/SSR for shareable public artifact URLs (`/n/{user}/{project}`, §47–48) needs a
  server-rendered React framework; Next.js provides it plus the `app/` routing we want.
- Tailwind + shadcn gives a polished, themeable base without owning a component library;
  shadcn source lives in-repo so we can customize deeply (§5 Human+AI control).
- The canvas itself is NOT built on these (see ADR 0005); this stack is the chrome
  (panels, menus, dialogs) around the canvas.

## Tradeoffs
- (−) Next.js App Router + heavy client canvas = careful `'use client'` boundaries and RSC
  seams. Mitigated: the Studio workbench is a single client island; the shell is server.
- (−) Tailwind v4 is newer than many tutorials. Accepted for speed of iteration.
