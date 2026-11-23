'use client';

import { cloneElement, useCallback, useEffect, useId, useRef, useState } from 'react';
import type { FocusEvent, ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { hint, type HintId } from '@/lib/hintCopy';
import type { Locale } from '@/lib/i18n';

type TeachingHintProps = {
  children: ReactElement;
  locale: Locale;
} & ({ hintId: HintId; text?: never } | { text: string; hintId?: never });

type Position = {
  left: number;
  top: number;
  placement: 'top' | 'bottom';
  maxWidth: number;
  maxHeight: number;
};

const EDGE = 12;
const GAP = 8;

export function TeachingHint({ children, locale, hintId, text }: TeachingHintProps) {
  const descriptionId = useId();
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const pinnedRef = useRef(false);
  const dismissedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const description = hintId ? hint(hintId, locale) : text ?? '';

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);

  const show = useCallback(() => {
    clearHideTimer();
    dismissedRef.current = false;
    setOpen(true);
  }, [clearHideTimer]);

  const hide = useCallback(() => {
    clearHideTimer();
    pinnedRef.current = false;
    setOpen(false);
  }, [clearHideTimer]);

  const scheduleHide = useCallback(() => {
    if (pinnedRef.current || rootRef.current?.contains(document.activeElement)) return;
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(hide, 120);
  }, [clearHideTimer, hide]);

  useEffect(() => clearHideTimer, [clearHideTimer]);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = rootRef.current?.firstElementChild as HTMLElement | null;
      const bubble = bubbleRef.current;
      if (!trigger || !bubble) return;
      const rect = trigger.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const maxWidth = Math.max(0, viewportWidth - EDGE * 2);
      bubble.style.maxWidth = `${maxWidth}px`;
      const width = bubble.offsetWidth;
      const naturalHeight = bubble.offsetHeight;
      const triggerTop = rect.top - viewportTop;
      const triggerBottom = rect.bottom - viewportTop;
      const aboveSpace = Math.max(0, triggerTop - GAP - EDGE);
      const belowSpace = Math.max(0, viewportHeight - triggerBottom - GAP - EDGE);
      const fitsAbove = naturalHeight <= aboveSpace;
      const fitsBelow = naturalHeight <= belowSpace;
      const placement = fitsAbove || (!fitsBelow && aboveSpace >= belowSpace) ? 'top' : 'bottom';
      const available = placement === 'top' ? aboveSpace : belowSpace;
      const maxHeight = Math.min(naturalHeight, available);
      if (maxHeight <= 0) {
        hide();
        return;
      }
      bubble.style.maxHeight = `${maxHeight}px`;
      const height = bubble.offsetHeight;
      const center = rect.left + rect.width / 2 - viewportLeft;
      const left = Math.min(
        Math.max(center - width / 2, viewportLeft + EDGE),
        viewportLeft + viewportWidth - width - EDGE,
      );
      const top = placement === 'top'
        ? viewportTop + triggerTop - GAP - height
        : viewportTop + triggerBottom + GAP;
      setPosition({ left, top, placement, maxWidth, maxHeight });
    };
    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!rootRef.current?.contains(target) && !bubbleRef.current?.contains(target)) hide();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const root = rootRef.current;
      const trigger = root?.firstElementChild as HTMLElement | null;
      const focusInside = !!root?.contains(document.activeElement);
      hide();
      if (!focusInside) return;
      event.preventDefault();
      event.stopPropagation();
      dismissedRef.current = true;
      trigger?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener('resize', place);
    visualViewport?.addEventListener('scroll', place);
    const frame = window.requestAnimationFrame(place);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      visualViewport?.removeEventListener('resize', place);
      visualViewport?.removeEventListener('scroll', place);
      window.cancelAnimationFrame(frame);
    };
  }, [open, description, hide]);

  const onBlur = (event: FocusEvent<HTMLSpanElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      dismissedRef.current = false;
      hide();
    }
  };

  const child = children as ReactElement<Record<string, unknown>>;
  const describedBy = [child.props['aria-describedby'], descriptionId].filter(Boolean).join(' ');
  const nonInteractive = typeof child.type === 'string' && ['span', 'div'].includes(child.type);
  const trigger = cloneElement(child, {
    'aria-describedby': describedBy,
    'data-teaching-hint-trigger': descriptionId,
    tabIndex: child.props.tabIndex ?? (nonInteractive ? 0 : undefined),
    title: undefined,
  });

  return (
    <span
      ref={rootRef}
      className="hint-anchor"
      data-teaching-hint={descriptionId}
      onFocusCapture={() => {
        if (!dismissedRef.current) show();
      }}
      onBlurCapture={onBlur}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') show();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') scheduleHide();
      }}
      onPointerDownCapture={(event) => {
        if (event.pointerType !== 'mouse') {
          pinnedRef.current = true;
          show();
        }
      }}
    >
      {trigger}
      <span id={descriptionId} role="tooltip" className="hint-description">
        {description}
      </span>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={bubbleRef}
              className="hint-bubble"
              data-teaching-hint-bubble={descriptionId}
              data-placement={position?.placement}
              aria-hidden="true"
              style={{
                left: position?.left ?? 0,
                top: position?.top ?? 0,
                maxWidth: position?.maxWidth,
                maxHeight: position?.maxHeight,
                visibility: position ? 'visible' : 'hidden',
              }}
              onPointerEnter={clearHideTimer}
              onPointerLeave={scheduleHide}
            >
              {description}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
