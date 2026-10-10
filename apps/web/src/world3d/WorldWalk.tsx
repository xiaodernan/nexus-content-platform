'use client';

import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';
import {
  LABEL_LIMIT,
  NEARBY_RADIUS,
  nearestEntities,
  pickLabelTargets,
  resolveWalkCollision,
  sceneLegend,
  terrainHeightAt,
  walkToward,
  type SceneEntity,
  type WorldScene,
} from '@nexus/world-model';
import { CharacterChat } from '@/studio/CharacterChat';
import { apiAssetUrl } from '@/studio/assets';

/**
 * §140 的"走进去"：Three.js + React Three Fiber 渲染 §140 那份场景计划，
 * 键盘 WASD / 方向键走、鼠标按住拖动转视角，走近了 HUD 展开条目正文。
 *
 * 四条不糊弄的：
 * -  WebGL 用不起来时**明说**（不是一片黑屏，也不是退回 2D 图却叫"世界"）；
 * -  名字标签是 DOM 投影出来的，不是画进 WebGL 的：能被点、能被读屏、能被测试断言，
 *    也就不用为了文字再引一个依赖。只显示离你最近的 LABEL_LIMIT 个，被截了就在角上说；
 * -  走近才展开正文：远处只有名字，正文要走到跟前（或点名字）才给（§140 的 explore）；
 * -  `fallback` 位置的条目在 HUD 里标出来：那是按序号排在环上的，不是作者摆过的地形。
 *
 * 碰撞与点击行走（2026-10-07 接上）：条目占位会挡路（`resolveWalkCollision`，模型包的纯函数），
 * 点地面/条目名朝那儿走（`walkToward`：直线 + 碰撞滑动）。
 * 3D 资产（2026-10-09 接通）：挂了 §34 model 资产的条目用 GLTF 渲染，URL 走 `apiAssetUrl`
 * 那条鉴权路由，加载中与失败都退回类别占位几何体（不空白、不只剩气墙）。
 * 地形（2026-10-10 第四片）：作者画的圆台是**可走的地**——相机高度 = 眼高 + 圆台高度
 * （`terrainHeightAt(scene.terrain, …)`，模型包的纯函数），点击地面的射线也读同一个高度查询。
 * 没有做的事（也不假装）：导航网格（点击行走绕不过大障碍，会停在障碍前——限度写在 HUD）。
 * talk（§47）接的是 §46 角色档案的对话 API——目标不是场景里的世界条目。
 */

const WALK_SPEED = 9; // 单位/秒：一个条目半径约 1，走起来约 9 个身位每秒
const ENTITY_SIZE = 1.6;
/** 观察者眼睛离脚下地面多高：地形上 = 台面 + 这个数（没地形时就是 3.2，与接地形之前一致） */
const EYE_HEIGHT = 3.2;

type Keys = Record<string, boolean>;

function Controls({
  onPosition,
  scene,
  enabled,
}: {
  onPosition: (at: { x: number; z: number }) => void;
  scene: WorldScene;
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
  // 点击行走（walkToward）：点地面设目标，每帧朝它走；键盘一动就交还给人
  const target = useRef<{ x: number; z: number } | null>(null);
  const stuckFor = useRef(0);
  // 点地面 = 指针按下与抬起几乎没移动；拖动转视角共用同一对事件
  const raycaster = useRef(new THREE.Raycaster());
  const ndc = useRef(new THREE.Vector2());
  // scene 走 ref：pointerup 那个 effect 的依赖是 [gl, camera]（不该每次输入都重挂事件），
  // 而 scene 会随地形编辑变——闭包捕获旧的那份会让"改了地形之后点击还按旧高度落地"
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  /**
   * 点击地面的落点（第四片）。地不再是 y=0 一张平面：圆台是分段常数的高度。
   * 逐个圆台试交点太贵（每帧点击一次也要 64 次射线-圆求交），所以这里反过来——
   * 先按**视线与地平**求一个候选点，再拿候选点的 (x,z) 问地形高度；差得远就沿射线
   * 再试一次（站在台子边往下看圆台里面时，地平候选点在台子外，高度对不上）。
   * 两次迭代对分段常数的地形已经收敛：圆台高度只来自它自己的半径，射线与某个圆盘
   * 的交点高度差不会带动下一个圆盘。这是近似，但近似方向是"站在多高就点多高的地"。
   */
  const pickGroundPoint = (): { x: number; z: number } | null => {
    const ray = raycaster.current.ray;
    const candidate = new THREE.Vector3();
    if (!ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), candidate)) return null;
    for (let i = 0; i < 2; i += 1) {
      const height = terrainHeightAt(sceneRef.current.terrain, candidate.x, candidate.z);
      if (Math.abs(candidate.y - height) < 0.01) return { x: candidate.x, z: candidate.z };
      // 把射线起点挪到当前候选高度上，重新求与那个水平面的交点
      const lifted = new THREE.Vector3(ray.origin.x, ray.origin.y - height, ray.origin.z);
      const dir = ray.direction;
      if (Math.abs(dir.y) < 1e-6) break; // 视线几乎是水平的：没有下一层可求
      const t = -lifted.y / dir.y;
      if (t < 0) break;
      const next = new THREE.Vector3(lifted.x + dir.x * t, height, lifted.z + dir.z * t);
      const moved = Math.hypot(next.x - candidate.x, next.z - candidate.z);
      candidate.copy(next);
      if (moved < 0.01) break;
    }
    return { x: candidate.x, z: candidate.z };
  };

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
      // 按下与抬起几乎没动：是点击地面（不是拖视角），把落点设为行走目标
      if (drag.current && Math.hypot(e.clientX - drag.current.x, e.clientY - drag.current.y) < 6) {
        const rect = el.getBoundingClientRect();
        ndc.current.set(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.current.setFromCamera(ndc.current, camera);
        const ground = pickGroundPoint();
        if (ground) {
          target.current = ground;
          stuckFor.current = 0;
        }
      }
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
  }, [gl, camera]);

  useFrame((_, delta) => {
    if (!enabled) return;
    const k = keys.current;
    // 前进方向取相机朝向在地面上的投影：转身之后 W 就该往看着的那边走
    const forward = (k['w'] || k['arrowup'] ? 1 : 0) - (k['s'] || k['arrowdown'] ? 1 : 0);
    const strafe = (k['d'] || k['arrowright'] ? 1 : 0) - (k['a'] || k['arrowleft'] ? 1 : 0);
    const walking = forward !== 0 || strafe !== 0;
    let dx = 0;
    let dz = 0;
    if (walking) {
      target.current = null; // 手动接管：点击目标作废
      const sin = Math.sin(yaw.current);
      const cos = Math.cos(yaw.current);
      // 视线方向投到地面：抬头低头不改变"走多快"，否则仰角一大就走不动
      dx = (sin * forward + cos * strafe) * WALK_SPEED * delta;
      dz = (cos * forward - sin * strafe) * WALK_SPEED * delta;
    } else if (target.current) {
      const prevX = camera.position.x;
      const prevZ = camera.position.z;
      const step = walkToward(scene, { x: prevX, z: prevZ }, target.current, WALK_SPEED * delta);
      dx = step.x - prevX;
      dz = step.z - prevZ;
      if (step.arrived) target.current = null;
      else if (Math.hypot(dx, dz) < WALK_SPEED * delta * 0.1) {
        // 被占位挡住原地蹭：半秒没进展就停，不说"已到达"也不永远卡着
        stuckFor.current += delta;
        if (stuckFor.current > 0.6) target.current = null;
      } else stuckFor.current = 0;
    }
    camera.position.x += dx;
    camera.position.z += dz;
    // 占位碰撞（模型包的纯函数，与单测同一份算术）：条目挡路，穿不过去
    const resolved = resolveWalkCollision(scene, camera.position.x, camera.position.z);
    camera.position.x = resolved.x;
    camera.position.z = resolved.z;
    // 地形（第四片）：相机贴在**这一点的地面**上——眼高 + 圆台高度。
    // 走上圆台是"地升高了"，不是"飘上去"：click 行走与键盘走都走这一行
    camera.position.y = EYE_HEIGHT + terrainHeightAt(scene.terrain, camera.position.x, camera.position.z);
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

/** §34 GLTF 模型加载：从项目资产目录读取 .glb/.gltf 并渲染 */
function ModelAsset({
  assetId,
  scale,
  color,
}: {
  assetId: string;
  scale: number;
  color: string;
}) {
  const [gltf, setGltf] = useState<THREE.Group | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setGltf(null);
    setFailed(false);
    const loader = new GLTFLoader();
    loader.load(
      // 走 apiAssetUrl()——Studio/预览场景下"assetId → 可请求地址"的唯一投影（§16）。
      // 自己拼路径必错：这一格第一版拼的是 /api/assets/<projectId>/<assetId>，
      // 而真路由是鉴权的 /api/assets/<assetId>/file（两段 vs 一段）——每个模型都 404，
      // 控制台刷一屏 warn，条目位置上只剩一个看不见但挡路的气墙。
      apiAssetUrl(assetId),
      (result) => {
        if (!cancelled) setGltf(result.scene);
      },
      undefined,
      (err) => {
        if (cancelled) return;
        setFailed(true);
        // 失败出声，但只在控制台：用户看得见的"失败"是下面那个占位几何体，不是空白
        console.warn(`[WorldWalk] 模型 ${assetId} 加载失败，退回占位几何体：`, err instanceof Error ? err.message : err);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  if (gltf && !failed) {
    // GLTF 模型默认朝 -Z（three.js 相机看向的方向）；缩放没有尺寸字段可依，
    // 给调用方传来的那个合理缺省，让模型不至于太大或太小
    return <primitive object={gltf} scale={scale} />;
  }

  // 加载中与加载失败都不留空白：退回类别占位几何体（线框盒）。
  // "转圈半天然后没东西"和"一个路标"是两种可读性——后者至少告诉你这里有个东西
  return (
    <mesh position={[0, ENTITY_SIZE / 2, 0]}>
      <boxGeometry args={[ENTITY_SIZE, ENTITY_SIZE, ENTITY_SIZE]} />
      <meshStandardMaterial color={color} wireframe />
    </mesh>
  );
}

/**
 * §140 第四片的地形渲染。圆台是**半透明盘 + 一根高度柱**，不是一个实心方块：
 * - 半透明：站在台子外往里看要看得见台子上的条目（实心盘会把它们挡成黑影）；
 * - 高度柱（柱心在圆盘中心，从地面穿到台面）：台面悬在空中时，这根柱子就是
 *   "它靠什么撐着"的答案——与高程标架柱同一套语言，别让作者猜；
 * - 台面下 0.06 处画边界圈：硬边的地回答"这里是不是台沿"。圈贴在盘面下一丁点，
 *   是为了不被盘自己的半透明面 z-fighting 吃掉。
 * 高度 0 的圆台不画：它就在地平面上（模型侧 `terrainHeightAt` 也跳过它），
 * 画一个看不见的盘只会让线段数白涨。
 */
function TerrainPlates({ terrain }: { terrain: WorldScene['terrain'] }) {
  if (!terrain.authored) return null;
  return (
    <group data-world-terrain>
      {terrain.plateaus.map((plateau) =>
        plateau.height <= 0 ? null : (
          <group key={plateau.id} position={[plateau.x, 0, plateau.z]}>
            {/* 台面盘：圆盘的圆心在地面上方 height 处 */}
            <mesh position={[0, plateau.height, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[plateau.radius, 48]} />
              <meshBasicMaterial color="#1d5c4a" transparent opacity={0.35} side={THREE.DoubleSide} />
            </mesh>
            {/* 高度柱：从地面撐到台面 */}
            <mesh position={[0, plateau.height / 2, 0]}>
              <cylinderGeometry args={[0.06, 0.06, Math.max(0.1, plateau.height), 6]} />
              <meshBasicMaterial color="#5a6478" />
            </mesh>
            {/* 台沿圈：硬边在哪一环，走在上面的人看得见 */}
            <mesh position={[0, plateau.height - 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[plateau.radius - 0.12, plateau.radius, 48]} />
              <meshBasicMaterial color="#7ee2b8" transparent opacity={0.9} side={THREE.DoubleSide} />
            </mesh>
          </group>
        ),
      )}
    </group>
  );
}

function EntityMesh({ entity }: { entity: SceneEntity }) {  const near = entity.placed === 'fallback';
  // 高程（图上写的 0–6）：条目浮在写的高度上，柱子从地面把它撑起来——那是标架，不是你在爬的坡
  const base = entity.elevation;

  // 挂了 §34 model 资产的条目：加载 / 失败都回到类别占位几何体（ModelAsset 里做），
  // 再加 fallback 与高程两根标架柱
  if (entity.modelAssetId) {
    return (
      <group position={[entity.x, base, entity.z]}>
        <Suspense fallback={null}>
          <ModelAsset assetId={entity.modelAssetId} scale={ENTITY_SIZE / 2} color={entity.color} />
        </Suspense>
        {near && (
          <mesh position={[0, ENTITY_SIZE / 2, 0]}>
            <boxGeometry args={[ENTITY_SIZE, ENTITY_SIZE, ENTITY_SIZE]} />
            <meshStandardMaterial color={entity.color} wireframe />
          </mesh>
        )}
        {base > 0 ? (
          <mesh position={[0, -base / 2, 0]}>
            <cylinderGeometry args={[0.08, 0.08, base, 6]} />
            <meshBasicMaterial color="#5a6478" />
          </mesh>
        ) : null}
        <mesh position={[0, ENTITY_SIZE + 1.2, 0]}>
          <cylinderGeometry args={[0.08, 0.08, 2.4, 6]} />
          <meshBasicMaterial color={entity.color} />
        </mesh>
      </group>
    );
  }

  // 没有 modelAssetId：用占位几何体
  return (
    <group position={[entity.x, base, entity.z]}>
      <mesh position={[0, ENTITY_SIZE / 2, 0]}>
        <boxGeometry args={[ENTITY_SIZE, ENTITY_SIZE, ENTITY_SIZE]} />
        <meshStandardMaterial color={entity.color} wireframe={near} />
      </mesh>
      {base > 0 ? (
        <mesh position={[0, -base / 2, 0]}>
          <cylinderGeometry args={[0.08, 0.08, base, 6]} />
          <meshBasicMaterial color="#5a6478" />
        </mesh>
      ) : null}
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

/** 一个名字标签：屏幕坐标 + 一点上下文（类别、离你多远、位置是不是摆过的） */
interface ScreenLabel {
  id: string;
  title: string;
  kindLabel: string;
  color: string;
  placed: SceneEntity['placed'];
  distance: number;
  x: number;
  y: number;
}

/**
 * 把最近若干条目的名字投影成屏幕坐标，交给**DOM** 画而不是画进 WebGL 里：
 * 这样标签能被选中、能被读屏、能被测试断言，也不用为了文字再引一个依赖。
 * 每 0.1 秒更新一次——逐帧写 React state 会把整个面板拖进重渲染，而名字不需要 60Hz。
 */
function LabelProjector({
  scene,
  onLabels,
  limit,
}: {
  scene: WorldScene;
  onLabels: (labels: ScreenLabel[]) => void;
  limit: number;
}) {
  const { camera, size } = useThree();
  const sinceReport = useRef(0);
  const vector = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    sinceReport.current += delta;
    if (sinceReport.current < 0.1) return;
    sinceReport.current = 0;
    const picked = pickLabelTargets(scene, { x: camera.position.x, z: camera.position.z }, limit);
    const next: ScreenLabel[] = [];
    for (const entity of picked) {
      const v = vector.current.set(entity.x, ENTITY_SIZE + 2.8, entity.z).project(camera);
      if (v.z > 1) continue; // 已经在相机背后，画出来会"贴"在屏幕上
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      if (x < -60 || y < -24 || x > size.width + 60 || y > size.height + 24) continue;
      next.push({
        id: entity.id,
        title: entity.title,
        kindLabel: entity.kindLabel,
        color: entity.color,
        placed: entity.placed,
        distance: entity.distance,
        x,
        y,
      });
    }
    onLabels(next);
  });

  return null;
}

export function WorldWalk({
  scene,
  projectName,
  projectId,
  characters,
}: {
  scene: WorldScene;
  projectName: string;
  projectId: string;
  characters: { id: string; name: string }[];
}) {
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [at, setAt] = useState({ x: 0, z: 0 });
  const [selected, setSelected] = useState<string | null>(null);
  const [labels, setLabels] = useState<ScreenLabel[]>([]);
  // §140 的 talk：目标永远是 §46 的角色档案，不是场景里那些同名的世界条目——
  // 世界条目是九类正文之一，档案才是有人设、有声音、聊完落记忆的那一个
  const [talkOpen, setTalkOpen] = useState(false);
  const [talkTarget, setTalkTarget] = useState<string | null>(characters[0]?.id ?? null);

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
    <div
      className="relative h-full w-full bg-bg-0"
      data-world3d="live"
      data-world-name={scene.worldName}
      // 高度也进读数：走在圆台上时 e2e 能断言"人确实在台面上"，
      // 不然相机贴地这件事在真浏览器里没有任何可核对的凭据
      data-walk-at={`${Math.round(at.x * 10) / 10},${Math.round(at.z * 10) / 10}`}
      data-walk-height={Math.round(terrainHeightAt(scene.terrain, at.x, at.z) * 100) / 100}
    >
      <Canvas
        // 起点也要贴着地形：圆台铺在出生点上时，写死 3.2 会让相机陷在台子里
        camera={{
          position: [0, EYE_HEIGHT + terrainHeightAt(scene.terrain, 0, 0), -Math.max(16, scene.bounds.radius * 0.9)],
          fov: 60,
          near: 0.1,
          far: 400,
        }}
        gl={{ antialias: true }}
        dpr={[1, 2]}
      >
        <color attach="background" args={['#0b0d12']} />
        <fog attach="fog" args={['#0b0d12', 40, 160]} />
        <hemisphereLight args={['#cdd6ff', '#101318', 0.9]} />
        <directionalLight position={[20, 30, 10]} intensity={0.7} />
        <gridHelper args={[scene.bounds.radius * 2, Math.max(8, Math.round(scene.bounds.radius / 2) * 2), '#2a3040', '#171b23']} />
        <TerrainPlates terrain={scene.terrain} />
        {scene.entities.map((entity) => (
          <EntityMesh key={entity.id} entity={entity} />
        ))}
        <LinkLines scene={scene} />
        <Controls onPosition={setAt} scene={scene} enabled />
        <LabelProjector scene={scene} onLabels={setLabels} limit={LABEL_LIMIT} />
      </Canvas>

      {/* 名字标签：DOM 层，能被点、能被读屏、能被测试断言 */}
      <div className="pointer-events-none absolute inset-0" data-world-labels>
        {labels.map((label, index) => (
          <button
            key={label.id}
            type="button"
            onClick={() => setSelected(label.id)}
            data-world-label={label.id}
            data-placed={label.placed}
            title={`${label.kindLabel} · 离你 ${label.distance}`}
            className="pointer-events-auto absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-bg-1/85 px-1.5 py-[1px] text-11 text-fg-1 hover:bg-bg-2"
            // 近处的标签要压过远处的：DOM 默认后画的在上面，而数组是"由近到远"排的，
            // 不显式给 z-index 就会出现"远处的名字挡住近处的、点不到"（e2e 点标签时撞上的）
            style={{ left: label.x, top: label.y, zIndex: LABEL_LIMIT - index }}
          >
            <span className="mr-1 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: label.color }} />
            {label.title}
          </button>
        ))}
        {labels.length >= LABEL_LIMIT ? (
          <p className="absolute bottom-2 right-3 text-11 text-fg-3" data-label-capped>
            标签只显示离你最近的 {LABEL_LIMIT} 个（这一页共 {scene.stats.entities} 个条目）
          </p>
        ) : null}
      </div>

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
          <p className="mt-2 text-11 text-fg-2">
            WASD / 方向键走动，按住鼠标拖动转视角；点地面走过去（直线加碰撞滑动——绕不过大障碍时会停在障碍前）。
            点条目名是展开正文，不会把你搬过去。
          </p>
          <p className="text-11 text-fg-3">
            条目占位会挡路（圆碰撞）。没有地形：模型里没有高程字段，脚下是平的。对话（§47）跟的是 §46
            角色档案，不是这些世界条目。
          </p>
          <button
            type="button"
            onClick={() => setTalkOpen((open) => !open)}
            data-world-talk-toggle
            aria-expanded={talkOpen}
            className="mt-2 rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-11 text-fg-2 hover:bg-bg-3"
          >
            {talkOpen ? '收起对话' : '跟角色说话'}
          </button>
          {talkOpen ? (
            <div className="mt-2" data-world-talk>
              {characters.length ? (
                <>
                  <select
                    aria-label="对话的角色"
                    data-world-talk-target
                    value={talkTarget ?? ''}
                    onChange={(e) => setTalkTarget(e.target.value || null)}
                    className="mb-1 w-full rounded-[var(--nexus-radius-sm)] bg-bg-2 px-1 py-1 text-11 text-fg-1"
                  >
                    {characters.map((character) => (
                      <option key={character.id} value={character.id}>
                        {character.name}
                      </option>
                    ))}
                  </select>
                  {/* key 换人即换对话：与角色面板共用同一块（CharacterChat） */}
                  {talkTarget ? (
                    <CharacterChat
                      key={talkTarget}
                      projectId={projectId}
                      characterId={talkTarget}
                      characterName={characters.find((c) => c.id === talkTarget)?.name ?? ''}
                    />
                  ) : null}
                </>
              ) : (
                <p className="text-11 text-fg-3" data-world-talk-empty>
                  这个项目还没有角色档案（§46）。对话是跟档案说的——先回 Studio 的角色面板建一个。
                </p>
              )}
            </div>
          ) : null}
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

