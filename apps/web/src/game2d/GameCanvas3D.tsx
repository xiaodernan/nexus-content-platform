'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ARENA, step, type GamePlan, type SimInput, type SimState } from '@nexus/game-model';
import { KIND_COLORS } from './palette';

/**
 * §51 的第三种画法：`view === '3d'` 时的立体视角（three.js，与 `/world` 同一个渲染栈）。
 *
 * **它不是第二套游戏**——`compileForKind` 派出来的仍是 `compileGame` 那份计划，
 * 跑的仍是 `@nexus/game-model/sim` 那个 `step`，输入、HUD、任务、playtest 也全在 `GamePlay` 里共用。
 * 这里只做一件事：把同一组 (x, y) 画到三维场景里。因此下面每条限度都写在界面上，不只写在这里：
 *
 * - **判定仍在地平面上**：sim 是 2D 的（没有高度、没有纵深碰撞），3D 是视角不是物理；
 * - **几何体是类别标记**：球=玩家、方=敌人、菱=物品、锥=NPC，与 2D 的圆/方/菱/三角一一对应，
 *   颜色取 2D 同一份调色板（`palette.ts`）。§34 的 3D 模型资产与 §43 的动画都没有；
 * - **不画名字标签**：2D 在每个个体脚下写字，3D 没有（文字要朝向相机投影，是另一件事），
 *   名字在 HUD、任务列表与事件流里都还在；
 * - **WebGL 用不起来就明说**：不退回 2D 画法然后还叫「3D」（与 `/world` 同一条口径）。
 *
 * 为什么循环在这里而不在 `GamePlay`：three.js 要自己掌握渲染时机（`useFrame`），
 * `GamePlay` 那个 rAF 循环在 `view === '3d'` 时直接退出——两个循环各推一次 step 会让规则悄悄快一倍。
 *
 * `preserveDrawingBuffer: true` 是给 e2e 的：默认关掉它之后 `readPixels` 读到的是已清空的缓冲，
 * "画出来了"那条断言会变成一句谎话。代价是每帧多一次拷贝，这块画布只有 1200×760。
 */

export interface GameCanvas3DProps {
  plan: GamePlan;
  keys: RefObject<Record<string, boolean>>;
  stateRef: RefObject<SimState>;
  onHud: (state: SimState) => void;
}

/** WebGL 能不能用：与 `/world` 同一条口径——用不起来就明说，不悄悄换画法 */
function useWebglAvailable(): boolean | null {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const probe = document.createElement('canvas');
      setOk(Boolean(probe.getContext('webgl2') || probe.getContext('webgl')));
    } catch {
      setOk(false);
    }
  }, []);
  return ok;
}

/** 场地、网格与灯光：与状态无关，画一次就不动（地面颜色与 2D 画布的清屏色同一个值） */
function StaticScene() {
  const grid = useMemo(() => {
    const points: number[] = [];
    for (let x = 0; x <= ARENA.width; x += 100) points.push(x, 0.5, 0, x, 0.5, ARENA.height);
    for (let z = 0; z <= ARENA.height; z += 100) points.push(0, 0.5, z, ARENA.width, 0.5, z);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return geometry;
  }, []);

  const border = useMemo(() => {
    const w = ARENA.width;
    const h = ARENA.height;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0.6, 0, w, 0.6, 0, w, 0.6, 0, w, 0.6, h, w, 0.6, h, 0, 0.6, h, 0, 0.6, h, 0, 0.6, 0], 3),
    );
    return geometry;
  }, []);

  return (
    <>
      <color attach="background" args={['#0b0d12']} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[ARENA.width * 0.4, ARENA.height * 1.6, ARENA.height * 0.8]} intensity={0.9} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ARENA.width / 2, 0, ARENA.height / 2]}>
        <planeGeometry args={[ARENA.width, ARENA.height]} />
        <meshStandardMaterial color="#0b0d12" />
      </mesh>
      <lineSegments geometry={grid}>
        <lineBasicMaterial color="#1e2433" />
      </lineSegments>
      <lineSegments geometry={border}>
        <lineBasicMaterial color="#39415a" />
      </lineSegments>
    </>
  );
}

/** 按住拖动绕场地中心转视角（俯仰夹在 0.18~1.35 弧度，不会钻到地底下或翻过来） */
function CameraRig() {
  const { camera, gl } = useThree();
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const yaw = useRef(Math.PI * 0.2);
  const pitch = useRef(0.62);

  useEffect(() => {
    const el = gl.domElement;
    const onDown = (e: PointerEvent) => {
      drag.current = { x: e.clientX, y: e.clientY, yaw: yaw.current, pitch: pitch.current };
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag.current) return;
      yaw.current = drag.current.yaw - (e.clientX - drag.current.x) * 0.006;
      pitch.current = Math.min(1.35, Math.max(0.18, drag.current.pitch + (e.clientY - drag.current.y) * 0.005));
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

  useFrame(() => {
    const cx = ARENA.width / 2;
    const cz = ARENA.height / 2;
    // 半径取"能把整块场地装进画面"的那个量级：场地 1200×760，取 max 的 0.95 倍
    const r = Math.max(ARENA.width, ARENA.height) * 0.95;
    const horizontal = r * Math.cos(pitch.current);
    camera.position.set(
      cx + Math.sin(yaw.current) * horizontal,
      r * Math.sin(pitch.current),
      cz + Math.cos(yaw.current) * horizontal,
    );
    camera.lookAt(cx, 0, cz);
  });

  return null;
}

type ActorKind = 'player' | 'enemy' | 'item' | 'npc';

interface ActorSpec {
  id: string;
  kind: ActorKind;
  /** 半径（px）：几何体大小与 2D 的 `radius` 同一个数 */
  r: number;
  x: number;
  y: number;
  /** 只有敌人用得上：血条的分母（2D 也是拿满血当分母） */
  health: number;
}

/**
 * 场景里的活东西 + 每一帧推进。
 *
 * 顺序固定为三步且不能换：**输入 → step → 把结果摆回场景**。
 * 先读相机朝向算位移（WASD 跟着视角），再把 `step` 刚刚给出的 (x, y) 摆到世界坐标上——
 * 这里不自己推任何位置，所以"3D 里走得更快"这种事在结构上不会发生。
 *
 * ref 绑定用块体箭头函数（React 19 会把 ref 回调的**返回值**当清理函数调用）；
 * 这个组件只在 plan 变时重渲染，不会有"每次渲染解绑再绑"的抖动。
 */
function Actors({ plan, keys, stateRef, onHud }: GameCanvas3DProps) {
  const { camera } = useThree();

  const bodies = useRef(new Map<string, THREE.Group>());
  const barHolders = useRef(new Map<string, THREE.Group>());
  const barFills = useRef(new Map<string, THREE.Mesh>());
  const triggerRings = useRef(new Map<string, THREE.Mesh>());
  const specById = useRef(new Map<string, ActorSpec>());

  const forwardVec = useRef(new THREE.Vector3());
  const rightVec = useRef(new THREE.Vector3());
  const hudAcc = useRef(0);

  const specs = useMemo<ActorSpec[]>(() => {
    const out: ActorSpec[] = [];
    const add = (
      actor: { id: string; radius: number; x: number; y: number; health: number },
      kind: ActorKind,
      health?: number,
    ) => out.push({ id: actor.id, kind, r: actor.radius, x: actor.x, y: actor.y, health: health ?? actor.health });
    if (plan.player) add(plan.player, 'player');
    for (const enemy of plan.enemies) add(enemy, 'enemy', Math.max(1, enemy.health));
    for (const item of plan.items) add(item, 'item');
    for (const npc of plan.npcs) add(npc, 'npc');
    specById.current = new Map(out.map((spec) => [spec.id, spec]));
    return out;
  }, [plan]);

  useFrame((_, delta) => {
    const previous = stateRef.current;

    // 1) 输入：方向取相机朝向投到地平面上的那份，所以"往上"永远是"往画面深处"（与 2D 的屏幕方向同语义）
    const forward = camera.getWorldDirection(forwardVec.current).setY(0);
    if (forward.lengthSq() > 1e-6) forward.normalize();
    else forward.set(0, 0, -1);
    const right = rightVec.current.set(-forward.z, 0, forward.x);
    const held = keys.current;
    const fwd = (held['w'] || held['arrowup'] ? 1 : 0) - (held['s'] || held['arrowdown'] ? 1 : 0);
    const strafe = (held['d'] || held['arrowright'] ? 1 : 0) - (held['a'] || held['arrowleft'] ? 1 : 0);
    const input: SimInput = {
      dx: right.x * strafe + forward.x * fwd,
      dy: right.z * strafe + forward.z * fwd,
      attack: Boolean(held[' ']),
    };

    // 2) 规则：与 2D 画法调用的是同一个 step、同一份 plan
    stateRef.current = step(plan, previous, input, delta);
    const state = stateRef.current;

    // 3) 摆位：只读 sim 给出的 (x, y)；z 恒为 0 的那一层就是"地平面"
    if (plan.player) {
      const group = bodies.current.get(plan.player.id);
      if (group) {
        group.visible = state.health > 0;
        group.position.set(state.px, 0, state.py);
      }
    }
    for (const enemy of state.enemies) {
      const group = bodies.current.get(enemy.id);
      if (group) {
        group.visible = enemy.active;
        group.position.set(enemy.x, 0, enemy.y);
      }
      const holder = barHolders.current.get(enemy.id);
      const fill = barFills.current.get(enemy.id);
      const spec = specById.current.get(enemy.id);
      if (holder) {
        holder.visible = enemy.active;
        holder.quaternion.copy(camera.quaternion); // 血条永远正对相机，否则侧面看只剩一条线
      }
      if (fill && spec) {
        const width = spec.r * 2;
        const ratio = Math.max(0, Math.min(1, enemy.health / spec.health));
        fill.scale.set(width * ratio, 5, 1);
        fill.position.x = -spec.r + (width * ratio) / 2; // 左端钉死，从右边按比例缩（与 2D 一致）
      }
    }
    for (const item of state.items) {
      const group = bodies.current.get(item.id);
      if (group) {
        group.visible = item.active;
        group.position.set(item.x, 0, item.y);
      }
    }
    for (const trigger of state.triggers) {
      const material = triggerRings.current.get(trigger.id)?.material as THREE.MeshBasicMaterial | undefined;
      // 冷却期里亮一点：与 2D 画法同一个判据（readyAt > t）
      if (material) material.opacity = trigger.readyAt > state.t ? 0.35 : 0.14;
    }

    // 4) HUD 每 100ms 报一次（与 2D 同一个节流值：读数不需要 60Hz，逐帧 setState 会吃光主线程）
    hudAcc.current += delta;
    if (hudAcc.current > 0.1) {
      hudAcc.current = 0;
      onHud(state);
    }
  });

  return (
    <>
      {specs.map((spec) => (
        <group
          key={spec.id}
          position={[spec.x, 0, spec.y]}
          ref={(element) => {
            if (element) bodies.current.set(spec.id, element);
            else bodies.current.delete(spec.id);
          }}
        >
          {/* 形状只区分类别，与 2D 的圆/方/菱/三角一一对应——不是美术模型（§34 的资产没接） */}
          {spec.kind === 'player' ? (
            <mesh position={[0, spec.r, 0]}>
              <sphereGeometry args={[spec.r, 24, 16]} />
              <meshStandardMaterial color={KIND_COLORS.player} />
            </mesh>
          ) : null}
          {spec.kind === 'enemy' ? (
            <>
              <mesh position={[0, spec.r, 0]}>
                <boxGeometry args={[spec.r * 2, spec.r * 2, spec.r * 2]} />
                <meshStandardMaterial color={KIND_COLORS.enemy} />
              </mesh>
              {/* 血条：底 + 填充。填充的 scale 与位置每帧由上面那段按血量改（2D 也只画填充那一截） */}
              <group
                position={[0, spec.r * 2 + 10, 0]}
                ref={(element) => {
                  if (element) barHolders.current.set(spec.id, element);
                  else barHolders.current.delete(spec.id);
                }}
              >
                <mesh position={[0, 0, -0.1]}>
                  <planeGeometry args={[spec.r * 2, 5]} />
                  <meshBasicMaterial color="#3a2018" side={THREE.DoubleSide} />
                </mesh>
                <mesh
                  ref={(element) => {
                    if (element) barFills.current.set(spec.id, element);
                    else barFills.current.delete(spec.id);
                  }}
                >
                  <planeGeometry args={[1, 1]} />
                  <meshBasicMaterial color="#ef4444" side={THREE.DoubleSide} />
                </mesh>
              </group>
            </>
          ) : null}
          {spec.kind === 'item' ? (
            <mesh position={[0, spec.r, 0]}>
              <octahedronGeometry args={[spec.r, 0]} />
              <meshStandardMaterial color={KIND_COLORS.item} />
            </mesh>
          ) : null}
          {spec.kind === 'npc' ? (
            <mesh position={[0, spec.r * 1.1, 0]}>
              <coneGeometry args={[spec.r, spec.r * 2.2, 4]} />
              <meshStandardMaterial color={KIND_COLORS.npc} />
            </mesh>
          ) : null}
        </group>
      ))}

      {plan.triggers.map((trigger) => (
        <mesh
          key={trigger.id}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[trigger.x, 0.7, trigger.y]}
          ref={(element) => {
            if (element) triggerRings.current.set(trigger.id, element);
            else triggerRings.current.delete(trigger.id);
          }}
        >
          <ringGeometry args={[Math.max(1, trigger.radius - 5), Math.max(6, trigger.radius), 64]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.14} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  );
}

/**
 * 3D 画法的入口：WebGL 探测 → 场景 → 相机 → 活体与循环。
 * 高度用 `aspectRatio` 锁成 1200×760，和 2D 画布占同一块地方（切换画法不会让页面跳一下）。
 */
export function GameCanvas3D({ plan, keys, stateRef, onHud }: GameCanvas3DProps) {
  const webgl = useWebglAvailable();

  if (webgl === null) {
    return (
      <div
        className="flex items-center justify-center rounded border border-[var(--nexus-color-border-subtle)] bg-bg-0 font-mono text-12 text-fg-3"
        style={{ aspectRatio: `${ARENA.width} / ${ARENA.height}` }}
        data-game-3d="probing"
      >
        正在确认这台设备能不能用 WebGL…
      </div>
    );
  }
  if (!webgl) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded border border-[var(--nexus-color-border-subtle)] bg-bg-0 px-6 text-center"
        style={{ aspectRatio: `${ARENA.width} / ${ARENA.height}` }}
        data-game-3d="unavailable"
      >
        <p className="text-13 text-fg-1">这台设备/浏览器给不出 WebGL 上下文，3D 视角进不去。</p>
        <p className="text-11 text-fg-3" data-game-3d-reason>
          这里不会退回 2D 画法然后也叫「3D」。同一条关卡计划换个画法看：把文档类型改回 2D（或 2.5D），
          规则与数值一个字都不变。
        </p>
      </div>
    );
  }

  return (
    <div
      className="w-full overflow-hidden rounded border border-[var(--nexus-color-border-subtle)]"
      style={{ aspectRatio: `${ARENA.width} / ${ARENA.height}` }}
      data-game-3d="live"
      data-game-canvas-3d
    >
      <Canvas
        camera={{ fov: 55, near: 1, far: 6000, position: [ARENA.width / 2, 700, ARENA.height + 520] }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        dpr={[1, 2]}
      >
        <StaticScene />
        <CameraRig />
        <Actors plan={plan} keys={keys} stateRef={stateRef} onHud={onHud} />
      </Canvas>
    </div>
  );
}



