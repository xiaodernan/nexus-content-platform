'use client';

import { useMemo, useState } from 'react';
import type { AssetRef, DesignDocument } from '@nexus/design-model';
import type { VisualBenchmarkResponse } from '@nexus/schemas';
import { cn } from '@/lib/cn';
import { apiAssetUrl } from './assets';
import { SketchPad } from './SketchPad';
import { studio, useStudioReady } from './store';

/**
 * M2 Asset Library（line 227）：项目资产清单是设计模型的一部分（§16），
 * 这里只是它的一个投影——列出、预览、以及删除。
 *
 * 删除走 `studio.deleteAssetFromLibrary`：一次可撤销事务把资产移出清单并剥掉引用它的填充
 * （removeAsset 模型级负责跨页清理，§149）。字节删除是尽力而为的第二步，
 * 面板把"撤销能恢复引用、但文件字节回不来"这条非对称如实写进回执（§159），不假装万能。
 */

/**
 * 每个资产被多少个节点引用（一个节点里同一资产出现多次只算一次）。
 *
 * 原来是对**每个资产各扫一遍整页节点**（`referenceCount(doc, assetId)` 在 map 里被调用），
 * 复杂度是 资产数 × 节点数；而它挂在 `[assets, document]` 上，也就是每次改动都重算。
 * 50 个资产 × 4000 个节点 = 一次改动 20 万次循环，只为了在侧栏显示几个数字（§147）。
 * 现在反过来：节点走一遍，把命中的资产各自记一次，代价是 节点数 + 资产数。
 */
export function referenceCounts(doc: DesignDocument): Map<string, number> {
  const found = new Map<string, number>();
  const bump = (assetId: string) => found.set(assetId, (found.get(assetId) ?? 0) + 1);
  for (const page of doc.pages) {
    for (const node of Object.values(page.nodes)) {
      // 先用 Set 去重：同一个节点里同一资产出现在多个 fill 上仍然只算一次引用
      const ids = new Set<string>();
      if (Array.isArray(node.style.fills)) {
        for (const paint of node.style.fills) if (paint.kind === 'image') ids.add(paint.assetId);
      }
      if (node.assetId) ids.add(node.assetId);
      for (const id of ids) bump(id);
    }
  }
  return found;
}

function formatBytes(n?: number): string {
  if (!n || !Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;

/**
 * §86 结果区。纪律：测不出的维度渲染"测不出"+ 原因，绝不渲染成 0 分（§159）；
 * 像素亮度差标明是原始读数不是分数——它不参与"像不像"的结论。
 */
function VisualBenchmarkResult({ r }: { r: VisualBenchmarkResponse }) {
  const m = r.metrics;
  return (
    <div className="mt-2 flex flex-col gap-1 rounded-[var(--nexus-radius-sm)] bg-bg-2 p-2 text-12" data-vbench-result>
      <p className="font-mono text-11 text-fg-3">
        {r.reference.width}×{r.reference.height} × {r.candidate.width}×{r.candidate.height}
      </p>
      <ul className="flex flex-col gap-[2px]">
        <li data-vbench-layout title={m.layout.meaning}>
          布局 {pct(m.layout.score)}
        </li>
        <li data-vbench-spacing title={m.spacing.meaning}>
          间距（纵/横）{pct(m.spacing.vertical)} / {pct(m.spacing.horizontal)}
        </li>
        <li data-vbench-alignment title={m.alignment.meaning}>
          对齐 {pct(m.alignment.score)}
        </li>
        <li data-vbench-color title={m.color.meaning}>
          颜色 {pct(m.color.score)}
        </li>
      </ul>
      <p className="text-fg-3" title={m.pixel.meaning} data-vbench-pixel>
        像素亮度平均差 {m.pixel.meanAbsLuminanceDiff.toFixed(3)}（原始读数，不是分数）
      </p>
      {r.shapeMismatch ? (
        <p className="text-warn" data-vbench-shape-mismatch>
          两图宽高比差超过 5%，下面的分数要在这个前提下读。
        </p>
      ) : null}
      <ul className="flex flex-col gap-[2px] text-fg-3">
        {r.notMeasured.map((n) => (
          <li key={n.area} data-vbench-notmeasured={n.area}>
            测不出 {n.area}：{n.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AssetsPanel() {
  const state = useStudioReady();
  const assets = state.assets as AssetRef[];
  const [prompt, setPrompt] = useState('');
  const [vrefId, setVrefId] = useState('');
  const [vcandId, setVcandId] = useState('');
  const counts = useMemo(() => {
    const found = referenceCounts(state.document);
    return new Map(assets.map((a) => [a.id, found.get(a.id) ?? 0]));
  }, [assets, state.document]);
  const imageAssets = useMemo(() => assets.filter((a) => a.kind === 'image'), [assets]);

  return (
    <div className="flex h-full min-h-0 flex-col" data-assets-panel>
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--nexus-color-border-subtle)] px-[var(--nexus-space-3)] py-2">
        <h2 className="font-mono text-12 uppercase tracking-wide text-fg-3">资产库</h2>
        <span className="font-mono text-12 text-fg-3">{assets.length}</span>
      </header>

      {/* §38 Text → Image 的入口。本机没有图像 provider，所以按钮上直接写着 DEMO（§160），
          生成的资产在卡片上带 DEMO 角标——两者说的是同一件事：这不是模型给的图。 */}
      <div className="flex shrink-0 flex-col gap-1 border-b border-[var(--nexus-color-border-subtle)] px-[var(--nexus-space-3)] py-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="描述一张图，例如：一只在月球上弹吉他的猫"
          aria-label="图像生成的描述文字"
          data-image-prompt
          className="w-full rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] bg-bg-2 px-2 py-1 text-12 text-fg-1 placeholder:text-fg-3"
        />
        <button
          type="button"
          disabled={state.assetBusy || prompt.trim().length === 0}
          onClick={() => {
            void studio.generateImageFromPrompt(prompt).then((ok) => {
              if (ok) setPrompt('');
            });
          }}
          data-image-generate
          className="self-start rounded-[var(--nexus-radius-sm)] bg-bg-3 px-2 py-1 font-mono text-11 text-fg-2 hover:bg-bg-0 disabled:opacity-50"
        >
          {state.assetBusy ? '生成中…' : '生成图片（DEMO · 扣 2 点）'}
        </button>
      </div>

      {/* §38 Sketch → Image 的入口：同一句 prompt，构图来源从"随机"换成"你画的这张"。
          折叠着放——绘制面 240px 见方，常驻会把资产列表挤出可视区。 */}
      <details className="shrink-0 border-b border-[var(--nexus-color-border-subtle)] px-[var(--nexus-space-3)] py-2" data-sketch-section>
        <summary className="cursor-pointer font-mono text-11 text-fg-3">从草图生成（DEMO）</summary>
        <div className="mt-2">
          <SketchPad
            busy={state.assetBusy}
            canGenerate={prompt.trim().length > 0}
            onGenerate={(file) => studio.generateImageFromSketch(prompt, file).then((ok) => {
              if (ok) setPrompt('');
              return ok;
            })}
          />
        </div>
      </details>

      {/* §86 视觉基准的界面入口：从资产清单里点两份位图（参考 × 生成），服务端做本地
          确定性结构比较。这一格是**真数**，不是 DEMO——不借任何 provider。
          两份下拉不筛 mime：JPEG/WebP 选进去会让路由用 415 把"只支持 PNG、是哪张"
          讲清楚，比面板自己猜一份 mime 白名单诚实（§159）。 */}
      <details className="shrink-0 border-b border-[var(--nexus-color-border-subtle)] px-[var(--nexus-space-3)] py-2" data-vbench-section>
        <summary className="cursor-pointer font-mono text-11 text-fg-3">视觉基准（比较两张 PNG）</summary>
        {imageAssets.length < 2 ? (
          <p className="mt-2 text-12 text-fg-3">
            需要至少两张位图资产：一张当参考图，一张当生成结果。先上传或生成图片。
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-1">
            <label className="flex items-center gap-2 text-12 text-fg-2">
              参考图
              <select
                value={vrefId}
                onChange={(e) => setVrefId(e.target.value)}
                disabled={state.assetBusy}
                data-vbench-reference
                className="min-w-0 flex-1 rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] bg-bg-2 px-1 py-1 text-12 text-fg-1"
              >
                <option value="">选一张…</option>
                {imageAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-12 text-fg-2">
              生成图
              <select
                value={vcandId}
                onChange={(e) => setVcandId(e.target.value)}
                disabled={state.assetBusy}
                data-vbench-candidate
                className="min-w-0 flex-1 rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] bg-bg-2 px-1 py-1 text-12 text-fg-1"
              >
                <option value="">选一张…</option>
                {imageAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={state.assetBusy || !vrefId || !vcandId}
              onClick={() => void studio.compareVisualBenchmark(vrefId, vcandId)}
              data-vbench-run
              className="self-start rounded-[var(--nexus-radius-sm)] bg-bg-3 px-2 py-1 font-mono text-11 text-fg-2 hover:bg-bg-0 disabled:opacity-50"
            >
              {state.assetBusy ? '比较中…' : '比较结构'}
            </button>
          </div>
        )}
        {state.visualBenchmarkResult ? <VisualBenchmarkResult r={state.visualBenchmarkResult} /> : null}
      </details>

      {state.assetError ? (
        <p className="shrink-0 bg-warn/15 px-[var(--nexus-space-3)] py-2 text-12 text-warn" data-asset-error>
          {state.assetError}
        </p>
      ) : null}
      {state.assetNotice && !state.assetError ? (
        <p className="shrink-0 bg-bg-2 px-[var(--nexus-space-3)] py-2 text-12 text-fg-3" data-asset-notice>
          {state.assetNotice}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto p-[var(--nexus-space-2)]">
        {assets.length === 0 ? (
          <p className="m-auto max-w-[220px] px-3 py-8 text-center text-12 text-fg-3">
            还没有资产。在画布上选中元素，用属性面板上传一张图片，它就会出现在这里。
          </p>
        ) : (
          <ul className="flex flex-col gap-[var(--nexus-space-2)]">
            {assets.map((asset) => {
              const refs = counts.get(asset.id) ?? 0;
              const previewable = asset.kind === 'image' || asset.kind === 'svg';
              return (
                <li
                  key={asset.id}
                  className="flex items-stretch gap-2 overflow-hidden rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] bg-bg-2 p-2"
                  data-asset-card={asset.id}
                >
                  <div className="flex h-[56px] w-[56px] shrink-0 items-center justify-center overflow-hidden rounded-[var(--nexus-radius-sm)] bg-bg-3">
                    {previewable ? (
                      // 走鉴权 API 路由；缺失/无权限会 404，浏览器显示空白而非破图占位（§159 不假渲染）
                      <img src={apiAssetUrl(asset.id)} alt={asset.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="font-mono text-10 uppercase text-fg-3">{asset.kind}</span>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                    <span className="truncate text-12 text-fg-1" title={asset.name}>
                      {asset.name}
                    </span>
                    <span
                      className="truncate font-mono text-11 text-fg-3"
                      title={`${asset.width && asset.height ? `${asset.width}×${asset.height} · ` : ''}${formatBytes(asset.sizeBytes)} · 引用 ${refs}`}
                    >
                      {formatBytes(asset.sizeBytes)} · 引用 {refs}
                    </span>
                    {/* flex-wrap 是修"一字一行"的：这一排是角标 + 三个按钮，窄面板下不换行时
                        每个按钮都被压到自己的最小内容宽度以下，中文就一个字占一行 */}
                    <div className="flex flex-wrap items-center gap-1">
                      {asset.generatedBy?.demoMode ? (
                        <span
                          className={cn('rounded px-1 font-mono text-10 text-bg-0', 'bg-warn')}
                          title="这张图不是真模型给的：本机没有图像 provider，像素来自本地确定性合成器（§160）"
                          data-asset-demo-badge
                        >
                          DEMO
                        </span>
                      ) : null}
                      {asset.characterId ? (
                        // 只说"这是某个角色的场景/肖像"并带上 id：面板没加载角色名册，这里就不猜名字——
                        // 猜出来的名字是界面上的一句谎。而肖像与场景也不能一律叫场景：
                        // 那一格真值在 `characterPortrait` 里，读得到就要说得出
                        <span
                          className="rounded bg-bg-3 px-1 font-mono text-10 text-fg-2"
                          title={
                            asset.characterPortrait
                              ? `这是角色 ${asset.characterId} 自己的参考图：由档案驱动，后续场景可以拿它当参考`
                              : `这张图归属于角色 ${asset.characterId}`
                          }
                          data-asset-character={asset.characterId}
                          data-asset-portrait={asset.characterPortrait ? 'true' : undefined}
                        >
                          {asset.characterPortrait ? '角色肖像' : '角色场景'}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void studio.extractVisualDnaFromAsset(asset.id)}
                        disabled={state.assetBusy || asset.kind !== 'image'}
                        title={asset.kind === 'image' ? '把这张图当作参考图，提取项目的 Visual DNA（§30）' : '目前只有位图可提取'}
                        data-asset-dna={asset.id}
                        className="ml-auto rounded-[var(--nexus-radius-sm)] px-2 py-[2px] font-mono text-11 text-fg-3 hover:bg-bg-3 disabled:opacity-50"
                      >
                        提取视觉语言
                      </button>
                      <button
                        type="button"
                        onClick={() => void studio.generateImageFromPrompt(`变体 · ${asset.name}`, { referenceAssetId: asset.id })}
                        disabled={state.assetBusy || asset.kind !== 'image'}
                        title={
                          asset.kind === 'image'
                            ? '以这张图为参考再生成一张（DEMO 本地合成 · 扣 image 额度 2 点；换的是它派生出的色调，不是把画面内容改成另一个场景）'
                            : '目前只有位图可以做参考'
                        }
                        data-asset-variant={asset.id}
                        className="rounded-[var(--nexus-radius-sm)] px-2 py-[2px] font-mono text-11 text-fg-3 hover:bg-bg-3 disabled:opacity-50"
                      >
                        生成变体
                      </button>
                      {asset.characterId && asset.characterPortrait ? (
                        // §39 的闭环入口：这个角色自己的肖像 → 它的下一个场景。
                        // 只有肖像卡片给这个按钮——拿一张场景当参考再生成场景，就不是"同一个角色的身份"了
                        <button
                          type="button"
                          onClick={() =>
                            void studio.generateImageFromPrompt(`场景 · ${asset.name}`, {
                              characterId: asset.characterId,
                              referenceAssetId: asset.id,
                            })
                          }
                          disabled={state.assetBusy}
                          title="拿这张肖像当参考，为同一个角色再生成一个场景：色调取的是这张图量出来的主色（DEMO 本地合成 · 扣 image 额度 2 点）"
                          data-asset-scene-from-portrait={asset.id}
                          className="rounded-[var(--nexus-radius-sm)] px-2 py-[2px] font-mono text-11 text-fg-3 hover:bg-bg-3 disabled:opacity-50"
                        >
                          以此生成场景
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void studio.deleteAssetFromLibrary(asset.id)}
                        disabled={state.assetBusy}
                        data-asset-delete={asset.id}
                        className="rounded-[var(--nexus-radius-sm)] px-2 py-[2px] font-mono text-11 text-fg-3 hover:bg-bg-3 disabled:opacity-50"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
