# System Overview (diagrams)

The narrative architecture is in [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).
This folder holds evolving diagrams.

## Capability pipeline
```
RESEARCH → PLAN → DESIGN → GENERATE → CODE → BUILD → TEST
        → SIMULATE → DEPLOY → OBSERVE → IMPROVE → PUBLISH → REMIX
```

## Artifact lifecycle operations (§1)
```
Create · Edit · Run · Version · Fork · Remix · Publish · Share
```

## Design Model graph (excerpt)
```
Document
 └─ Page
     └─ Frame
         ├─ Node (rect/ellipse/line/path)
         ├─ Text
         ├─ Instance ──▶ Component ──▶ Variant
         └─ (Token · Asset referenced by id)
```
Every edge above is also a Project Graph node (§37) for semantic retrieval.

## State machine (slice)
```
idle ──prompt──▶ generate(demo) ──OpBatch──▶ validate ──ok──▶ apply ──▶ render/preview
                                              │ fail (would clobber code-only)
                                              └──▶ reject, keep prior model
apply/undo/redo maintain the OpBatch history stack (ADR 0006)
```
