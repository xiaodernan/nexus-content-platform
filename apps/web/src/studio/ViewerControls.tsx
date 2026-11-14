import type { BreakpointName, Page as DesignPage } from '@nexus/creative-model';
import { liveBreakpoints, viewerHref, VIEWPORT_OPTIONS, ZOOM_STEPS, type ViewerQuery } from './viewer-params';

interface Props {
  /** 这一页自己的路径：公开页是 `/n/<handle>/<slug>`，预览页是 `/preview/<projectId>` */
  base: string;
  /** 当前的查看器参数，原样带过去（换断点不该把缩放重置，反之也一样） */
  query: ViewerQuery;
  page: DesignPage;
  breakpoint: BreakpointName | undefined;
  zoom: number;
  /** 这一版按当前参数解出来的画框尺寸，写在行上让读数可见 */
  width: number;
  height: number;
  /** 公开页：没有显式 `?viewport=` 且这一页真有断点规则时，页面铺了四份投影、由媒体查询选一份 */
  auto?: boolean;
  /** 这一页有没有断点规则：没有规则时"自动"与"设计"是同一份投影，那颗按钮不摆（§159） */
  autoAvailable?: boolean;
}

/** 选中/未选中两种画法，两处（缩放、断点）共用一份。
 *  行内盒 + 24px 下限：这一排是给手机上的拇指点的，WCAG 2.5.8 的下限就是 24×24，
 *  第十三片那遍读数里"小于 24px 的点击目标"这一栏不该因为我多一排按钮更长。 */
const active = `vc-pill vc-pillOn`;
const idle = `vc-pill vc-pillIdle`;

/**
 * §14 / ADR-0069：查看器控件行 —— 公开页与预览页同一排、同一套参数名。
 *
 * 全是服务端渲染的 `<a>`：零 JS 也生效、可收藏、可分享，且与页面本体共用同一份
 * `resolveLayout`，不存在"第二条渲染路径"（ADR-0063 那条纪律的延伸）。
 * 这里不改模型、不改发布快照——它只决定同一份快照这一次怎么投影（§16）。
 */
export function ViewerControls({
  base,
  query,
  page,
  breakpoint,
  zoom,
  width,
  height,
  auto = false,
  autoAvailable = false,
}: Props) {
  // 只摆真的会改变投影的那几个断点：证明不了会变的这颗按钮不摆（§159），判定见 liveBreakpoints
  const live = liveBreakpoints(page);
  const liveSet = new Set<BreakpointName>(live);
  return (
    <div
      className="vc-row"
      data-viewer-controls
      data-viewer-design-width={page.width}
      data-viewer-resolved-width={width}
      data-viewer-resolved-height={height}
      data-viewer-breakpoint={breakpoint ?? 'design'}
      data-viewer-zoom={zoom}
      data-viewer-auto={auto ? 'on' : 'off'}
    >
      <span className="ap-faint" data-viewer-reading>
        {auto
          ? `按访客视口自动选档（四档各解一份）· 以 ${zoom} 倍呈现`
          : `按 ${width}×${height} 求解${breakpoint ? `（${breakpoint} 断点）` : '（设计尺寸）'} · 以 ${zoom} 倍呈现`}
      </span>
      <span className="wd-row1" data-viewer-zoom-options>
        {ZOOM_STEPS.map((step) => (
          <a
            key={step}
            href={viewerHref(base, query, { zoom: step === 1 ? undefined : String(step) })}
            data-viewer-zoom-option={step}
            className={zoom === step ? active : idle}
          >
            {step === 1 ? '原大' : `${step}×`}
          </a>
        ))}
      </span>
      {(() => {
        // 空按钮不摆：那一档重解出来与"按设计尺寸"逐字节相同（依据是 layout.test.ts 里那条同解见证）。
        // 访客正在看的这一档例外——它是"你现在在这"的标记，不是按钮。
        const options = VIEWPORT_OPTIONS.filter((o) => liveSet.has(o.id) || o.id === breakpoint);
        return (
          <span
            className="ap-wrapCenter"
            data-viewer-viewport-options
            data-viewer-live-breakpoints={live.join(',')}
          >
            {autoAvailable ? (
              <a
                href={viewerHref(base, query, { viewport: undefined })}
                data-viewer-viewport-option="auto"
                className={auto ? active : idle}
              >
                自动
              </a>
            ) : null}
            <a
              href={viewerHref(base, query, { viewport: autoAvailable ? 'design' : undefined })}
              data-viewer-viewport-option="design"
              className={!auto && breakpoint === undefined ? active : idle}
            >
              设计
            </a>
            {options.map((option) => (
              <a
                key={option.id}
                href={viewerHref(base, query, { viewport: option.id })}
                data-viewer-viewport-option={option.id}
                className={breakpoint === option.id ? active : idle}
              >
                {option.label}
              </a>
            ))}
          </span>
        );
      })()}
    </div>
  );
}
