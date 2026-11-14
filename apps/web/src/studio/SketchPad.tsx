'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale } from '@/lib/i18n';

/**
 * §38 Sketch → Image 的绘制面：一块白纸、一支黑笔。
 *
 * 它是草图的**输入面**，不是第二个画布——画布（§5）是设计文档的投影，一切编辑走 Command；
 * 这一块是生成链的原料采集：画的笔迹不进设计模型，导出成 PNG 走与上传同一道摄取门（§80），
 * 服务端量出落墨与笔画密度当构图来源（§38 那条箭头）。撤销一笔只是本地编辑原料，
 * 不碰文档，所以不进撤销栈——与分镜、世界面板同一口径（它们也不在画布撤销里）。
 *
 * 白底要先铺死再收笔迹：浏览器给的 canvas 是透明底，导出的 PNG 透明度通道会让
 * 服务端"平均亮度"量到空洞——纸白当墨水黑，一张没画的纸会被读成涂满。
 * 双语（v750）：locale 由 AssetsPanel 透传；zh 原文原样保留，en 逐句对应。
 */

const COPY = {
  zh: {
    undo: '撤销一笔',
    clear: '清空',
    strokes: (n: number) => `${n} 笔`,
    generateBusy: '生成中…',
    generateBtn: '从草图生成（DEMO · 扣 2 点）',
    canvasAria: '草图绘制区',
    pngFailed: '这块画布导不出 PNG（浏览器没给 blob）',
    sketchFilename: (ts: string) => `草图 ${ts}.png`,
    needPrompt: '上面的描述文字还空着——草图管构图，文字管画什么，缺一样都生成不了。',
    drawFirst: '先在白纸上画几笔——空白纸不算草图，这颗按钮也不该点得动。',
    limits:
      '落墨越重画面越暗，线越碎元素越多。边界说清：草图管',
    limitsEm: '构图密度与明暗',
    limitsTail:
      '，不管形状本身——"照草图的轮廓画"要真 provider 的图生图，接上之前不做假变换。',
  },
  en: {
    undo: 'Undo stroke',
    clear: 'Clear',
    strokes: (n: number) => `${n} strokes`,
    generateBusy: 'Generating…',
    generateBtn: 'Generate from sketch (DEMO · –2 credits)',
    canvasAria: 'Sketch pad',
    pngFailed: 'This canvas cannot export a PNG (the browser gave no blob)',
    sketchFilename: (ts: string) => `sketch ${ts}.png`,
    needPrompt: 'The prompt above is still empty — the sketch drives composition, the text drives what the image depicts; both are needed to generate.',
    drawFirst: 'Draw a few strokes on the paper first — a blank page is not a sketch, and the button should stay unpressable.',
    limits:
      'Heavier ink darkens the image; more fragmented lines mean more elements. Clear on the limits: the sketch drives ',
    limitsEm: 'composition density and tonal weight',
    limitsTail:
      ' — not shape itself — “draw exactly this silhouette” needs a real provider’s image-to-image; nothing fake is wired until then.',
  },
} as const;

const PAD_SIZE = 240;
const INK = '#101014';

type Point = { x: number; y: number };

function redraw(canvas: HTMLCanvasElement, strokes: Point[][]) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of strokes) {
    const start = stroke[0];
    if (!start) continue;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    if (stroke.length === 1) ctx.lineTo(start.x + 0.5, start.y + 0.5); // 一个点也要看得见：0 长度线 stroke 不出来
    for (const p of stroke.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
}

export function SketchPad({
  busy,
  canGenerate,
  onGenerate,
  locale = 'zh',
}: {
  busy: boolean;
  canGenerate: boolean;
  onGenerate: (file: File) => Promise<boolean>;
  locale?: Locale;
}) {
  const c = COPY[locale];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const drawing = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) redraw(canvas, strokes);
  }, [strokes]);

  const pointOf = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    // CSS 尺寸与画布像素可能不等比（窄面板里会缩），换算回像素坐标才能对上笔迹
    return {
      x: ((e.clientX - rect.left) / rect.width) * PAD_SIZE,
      y: ((e.clientY - rect.top) / rect.height) * PAD_SIZE,
    };
  };

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    // 坐标必须在 dispatch 之前量：updater 到 render 阶段才执行，那时 React 已把
    // currentTarget 释放成 null（真浏览器里第一笔就崩过这个）
    const start = pointOf(e);
    setStrokes((prev) => [...prev, [start]]);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const p = pointOf(e);
    setStrokes((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return prev;
      return [...prev.slice(0, -1), [...last, p]];
    });
  }, []);

  const onPointerUp = useCallback(() => {
    drawing.current = false;
  }, []);

  const submit = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || submitting) return;
    setSubmitting(true);
    setExportError(null);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error(c.pngFailed);
      // onGenerate 走 store 动作：失败原因已经落在面板的 assetError 格里，这里不再接住 reject
      await onGenerate(new File([blob], c.sketchFilename(new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')), { type: 'image/png' }));
    } catch (error) {
      // 只可能由导出这条路抛出——那是本地故障，store 帮不上，就地摊出来（§159）
      setExportError(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  }, [onGenerate, submitting, c]);

  return (
    <div className="sk-root">
      <canvas
        ref={canvasRef}
        width={PAD_SIZE}
        height={PAD_SIZE}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label={c.canvasAria}
        data-sketch-pad
        className="sk-paper"
        style={{ touchAction: 'none' }}
      />
      <div className="sk-row1">
        <button
          type="button"
          disabled={busy || strokes.length === 0}
          onClick={() => setStrokes((prev) => prev.slice(0, -1))}
          data-sketch-undo
          className="sk-btn"
        >
          {c.undo}
        </button>
        <button
          type="button"
          disabled={busy || strokes.length === 0}
          onClick={() => setStrokes([])}
          data-sketch-clear
          className="sk-btn"
        >
          {c.clear}
        </button>
        <span className="sk-monoFaint" data-sketch-strokes>
          {c.strokes(strokes.length)}
        </span>
      </div>
      <button
        type="button"
        disabled={busy || submitting || !canGenerate || strokes.length === 0}
        onClick={() => void submit()}
        data-sketch-generate
        className="sk-primary sk-selfStart"
      >
        {busy || submitting ? c.generateBusy : c.generateBtn}
      </button>
      {exportError ? (
        <p className="sk-warn12" data-sketch-export-error>
          {exportError}
        </p>
      ) : null}
      {strokes.length > 0 && !canGenerate ? (
        <p className="cp-warn11" data-sketch-need-prompt>
          {c.needPrompt}
        </p>
      ) : null}
      {strokes.length === 0 ? (
        <p className="wd-faint11" data-sketch-empty>
          {c.drawFirst}
        </p>
      ) : (
        <p className="wd-body11">
          {c.limits}<strong>{c.limitsEm}</strong>{c.limitsTail}
        </p>
      )}
    </div>
  );
}
