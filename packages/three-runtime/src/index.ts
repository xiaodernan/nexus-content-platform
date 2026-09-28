// M5 v139 — the package face is the UNION of its modules' surfaces, not a hand-copied list of them.
//
// The list used to be hand-maintained, which made every grant two grants: add the export, then remember the
// barrel line. `RefusalRow` — the row type v135 gave `refusalsFor`'s own table parameter — was declared,
// documented and unreachable from `@nexus/three-runtime`: a caller could ask for the refusal table but could
// not spell the type of the table it was handed. A wholesale barrel cannot forget a name, so the class of bug
// goes with it.
//
// `export *` was refused here before, and the refusal was right: a wholesale barrel is only safe when no two
// modules OWN the same exported name, because an ambiguous star exports silently drop the name. That is now a
// measured fact with a gate behind it rather than a judgment (`test/packageFace.test.ts`): the four modules'
// own-name sets are pairwise disjoint, and the single name two modules touch — `DEFAULT_THREE_CONFIG` — is
// owned by `types.ts` and merely passed through by `threeRuntime.ts`, so it is one binding with one owner, not
// two owners of one claim.
export * from './types.js';
export * from './threeRuntime.js';
export * from './saveStore.js';
export * from './renderBackend.js';
