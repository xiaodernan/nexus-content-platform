'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { NEARBY_RADIUS, nearestEntities, sceneLegend, type SceneEntity, type WorldScene } from '@nexus/world-model';

/**
 * §140 的"走进去"：Three.js + React Three Fiber 渲染 §140 那份场景计划，
 * 键盘 WASD / 方向键走、鼠标按住拖动转视角，走近了 HUD 展开条目正文。
 *
 * 三条不糊弄的：
 * -  WebGL 用不起来时**明说**（不是一片黑屏，也不是退回 2D 图却叫"世界"）；
 * -  走近才展开：远处只看到占位几何体与标题，正文要走到跟前才给（§140 的 explore）；
 * -  `fallback` 位置的条目在 HUD 里标出来：那是按序号排在环上的，不是作者摆过的地形。
 *
 * 没有做的事（也不假装）：地形网格、碰撞、寻路、3D 资产（§34 的 model）、
 * 以及和角色对话（§47 要 provider）。
 */

const WALK_SPEED = 9; // 单位/秒：一个条目半径约 1，走起来约 9 个身位每秒
const ENTITY_SIZE = 1.6;

type Keys = Record<string, boolean>;

function Controls({
  onPosition,
  enabled,
}: {
  onPosition: (at: { x: number; z: number }) => void;
  enabled: boolean;
}) {
  const { camera, gl } = useThree();
  const keys = useRef<Keys>({});
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  // 初始朝向 +Z：three.js 的相机默认看向 -Z，而场景内容在原点四周，
  // 不转这一下的话进场第一眼看到的是一片空地（第一次跑就踩到了）
  const yaw = useRef(Math.PI);
  const pitch = useRef(-0.12);
  const reported = useRef(0);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = true;
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    const el = gl.domElement;
    const onDown = (e: PointerEvent) => {
      drag.current = { x: e.clientX, y: e.clientY, yaw: yaw.current, pitch: pitch.current };
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag.current) return;
      yaw.current = drag.current.yaw - (e.clientX - drag.current.x) * 0.005;
      pitch.current = Math.min(1.2, Math.max(-1.2, drag.current.pitch + (e.clientY - drag.current.y) * 0.004));
    };
    const onUp = (e: PointerEvent) => {
      drag.current = null;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* 指针已经不在这里了，忽略 */
      }
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [gl]);

  useFrame((_, delta) => {
    if (!enabled) return;
    const k = keys.current;
    // 前进方向取相机朝向在地面上的投影：转身之后 W 就该往看着的那边走
    const forward = (k['w'] || k['arrowup'] ? 1 : 0) - (k['s'] || k['arrowdown'] ? 1 : 0);
    const strafe = (k['d'] || k['arrowright'] ? 1 : 0) - (k['a'] || k['arrowleft'] ? 1 : 0);
    const sin = Math.sin(yaw.current);
    const cos = Math.cos(yaw.current);
    // 视线方向投到地面：抬头低头不改变"走多快"，否则仰角一大就走不动
    const dx = (sin * forward + cos * strafe) * WALK_SPEED * delta;
    const dz = (cos * forward - sin * strafe) * WALK_SPEED * delta;
    camera.position.x += dx;
    camera.position.z += dz;
    camera.position.y = 3.2;
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw.current;
    camera.rotation.x = pitch.current;

    reported.current += delta;
    if (reported.current > 0.12) {
      reported.current = 0;
      onPosition({ x: camera.position.x, z: camera.position.z });
    }
  });

  return null;
}

function EntityMesh({ entity }: { entity: SceneEntity }) {
  const near = entity.placed === 'fallback';
  return (
    <group position={[entity.x, 0, entity.z]}>
      <mesh position={[0, ENTITY_SIZE / 2, 0]}>
        <boxGeometry args={[ENTITY_SIZE, ENTITY_SIZE, ENTITY_SIZE]} />
        <meshStandardMaterial color={entity.color} wireframe={near} />
      </mesh>
      {/* 一根细柱当"路标"，让远处也能看出这里有个条目；不画文字是因为文字要跟着朝向转，
          那一块还没做（用 drei 的 Html 会引入新依赖，先不扩面） */}
      <mesh position={[0, ENTITY_SIZE + 1.2, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 2.4, 6]} />
        <meshBasicMaterial color={entity.color} />
      </mesh>
    </group>
  );
}

function LinkLines({ scene }: { scene: WorldScene }) {
  const geometry = useMemo(() => {
    const points: number[] = [];
    for (const link of scene.links) {
      if (!link.points) continue;
      points.push(link.points.from[0], 0.2, link.points.from[1], link.points.to[0], 0.2, link.points.to[1]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return points.length ? g : null;
  }, [scene]);

  if (!geometry) return null;
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#5a6478" transparent opacity={0.7} />
    </lineSegments>
  );
}

export function WorldWalk({ scene, projectName }: { scene: WorldScene; projectName: string }) {
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [at, setAt] = useState({ x: 0, z: 0 });
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    try {
      const probe = document.createElement('canvas');
      setWebgl(Boolean(probe.getContext('webgl2') || probe.getContext('webgl')));
    } catch {
      setWebgl(false);
    }
  }, []);

  const nearby = useMemo(() => nearestEntities(scene, at), [scene, at]);
  const focused = selected ? scene.entities.find((e) => e.id === selected) ?? null : nearby[0] ?? null;

  if (webgl === null) {
    return (
      <div className="flex h-full items-center justify-center bg-bg-0 font-mono text-13 text-fg-3" data-world3d="probing">
        正在确认这台设备能不能用 WebGL…
      </div>
    );
  }
  if (!webgl) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-bg-0 px-6 text-center" data-world3d="unavailable">
        <p className="text-13 text-fg-1">这台设备/浏览器给不出 WebGL 上下文，3D 世界进不去。</p>
        <p className="text-11 text-fg-3">
          这里不会退回成 2D 图然后也叫「世界」：要读这些条目，用 Studio 里的世界与世界图视图。
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-bg-0" data-world3d="live" data-world-name={scene.worldName}>
      <Canvas
        camera={{ position: [0, 3.2, -Math.max(16, scene.bounds.radius * 0.9)], fov: 60, near: 0.1, far: 400 }}
        gl={{ antialias: true }}
        dpr={[1, 2]}
      >
        <color attach="background" args={['#0b0d12']} />
        <fog attach="fog" args={['#0b0d12', 40, 160]} />
        <hemisphereLight args={['#cdd6ff', '#101318', 0.9]} />
        <directionalLight position={[20, 30, 10]} intensity={0.7} />
        <gridHelper args={[scene.bounds.radius * 2, Math.max(8, Math.round(scene.bounds.radius / 2) * 2), '#2a3040', '#171b23']} />
        {scene.entities.map((entity) => (
          <EntityMesh key={entity.id} entity={entity} />
        ))}
        <LinkLines scene={scene} />
        <Controls onPosition={setAt} enabled />
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-3 p-3">
        <div className="pointer-events-auto max-w-[420px] rounded-[var(--nexus-radius-sm)] bg-bg-1/90 p-3" data-world-hud>
          <p className="text-13 font-semibold text-fg-1" data-hud-world>
            {scene.worldName}
          </p>
          <p className="text-11 text-fg-3">
            来自《{projectName}》 · {scene.stats.entities} 个条目 · {scene.stats.linksDrawn}/{scene.stats.links} 条关系
          </p>
          <p className="mt-1 text-11 text-fg-3">
            位置：{scene.stats.authored} 个来自你在世界图上摆过的坐标，{scene.stats.fallback} 个按文档顺序排在同心环上
            （线框的那些）。
          </p>
          <p className="mt-2 text-11 text-fg-2">WASD / 方向键走动，按住鼠标拖动转视角。走近条目会展开它的正文。</p>
          <p className="text-11 text-fg-3">
            没有碰撞与地形：能穿过去，也不算走在实地上。角色对话（§47）要 provider，这里不放假聊天。
          </p>
        </div>
        <div className="pointer-events-auto rounded-[var(--nexus-radius-sm)] bg-bg-1/90 p-2" data-world-legend>
          {sceneLegend(scene).map((entry) => (
            <span key={entry.kind} className="flex items-center gap-2 text-11 text-fg-2">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: entry.color }} />
              {entry.label} · {entry.count}
            </span>
          ))}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-3" data-nearby-panel>
        {focused ? (
          <div className="max-w-[720px] rounded-[var(--nexus-radius-sm)] bg-bg-1/95 p-3" data-nearby-focus={focused.id}>
            <p className="text-12 text-fg-1">
              <span className="mr-2 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: focused.color }} />
              {focused.title}
              <span className="ml-2 text-11 text-fg-3">
                {focused.kindLabel}
                {focused.placed === 'fallback' ? ' · 位置是按序号排的，不是摆过的' : ''}
              </span>
            </p>
            <p className="mt-1 max-h-[140px] overflow-auto whitespace-pre-wrap text-12 text-fg-2">{focused.body || '（这一条还没有正文）'}</p>
          </div>
        ) : (
          <p className="text-11 text-fg-3" data-nearby-empty>
            附近 {NEARBY_RADIUS} 个单位内没有条目。走远一点看看，或者用下面这些按钮直接读某一条——
            那只是展开正文，不会把你搬到那儿。
          </p>
        )}
        <div className="flex flex-wrap gap-1">
          {scene.entities.slice(0, 24).map((entity) => (
            <button
              key={entity.id}
              type="button"
              onClick={() => setSelected(entity.id)}
              data-read-entity={entity.id}
              className="rounded bg-bg-2 px-2 py-1 text-11 text-fg-2 hover:bg-bg-3"
            >
              读：{entity.title}
            </button>
          ))}
        </div>
        <ul className="max-w-[820px] text-11 text-fg-3" data-scene-limits>
          {scene.limits.map((limit) => (
            <li key={limit}>· {limit}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

