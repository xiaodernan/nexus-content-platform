# NEXUS Runtime

Where artifacts become experiences (§44): Web, interactive UI, Three.js/3D, games,
interactive stories. The Studio's **Live Preview** is the first runtime surface — it projects
the canonical Design Model into runnable HTML/CSS driven by design tokens.

3D/game runtime (§45, §16) uses Three.js / React Three Fiber / WebGL, exploring WebGPU where
appropriate, behind the same `CanvasRenderer`-style interface so the Design Model stays
canonical. Godot/Unity/Unreal export are future goals.

Status: 2D/live-preview slice exists; the 3D runtime lands with M5.
