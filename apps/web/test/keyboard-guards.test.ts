import { describe, expect, it } from 'vitest';
import { isControlTarget, isEditableTarget } from '@/lib/keyboard';

/**
 * §90 / WCAG 2.1.1 那份判据的单测。
 *
 * 这条判据被四处在用（Studio 画布、2D / RPG 两张游戏页、3D 世界），而 e2e 只在**有语料**的
 * 那几张面上量得到（种子输入框、playtest 按钮、说话按钮）。边界先钉在这里：
 * 它自己漂了的话，e2e 是最后才发现的，而那时的现场已经看起来像"用例坏了"。
 *
 * 用普通对象而不是真 DOM：`vitest.config.ts` 的 environment 是 node，
 * 判据也只问 tagName / isContentEditable / closest 三件事（这正是它不写 `instanceof` 的原因）。
 */

const CONTROL_SELECTOR =
  'button, a[href], summary, [role="button"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"]';

/** 一个只带判据要问的三件事的事件目标 */
function target(tagName: string, options: { editable?: boolean; control?: string | null } = {}): EventTarget {
  return {
    tagName,
    isContentEditable: options.editable ?? false,
    closest: (selector: string) => (selector === CONTROL_SELECTOR && options.control ? { tagName: options.control } : null),
  } as unknown as EventTarget;
}

describe('可编辑控件的判据（输入控件里的按键属于用户）', () => {
  it('input / textarea / select 都算可编辑', () => {
    expect(isEditableTarget(target('INPUT'))).toBe(true);
    expect(isEditableTarget(target('TEXTAREA'))).toBe(true);
    expect(isEditableTarget(target('SELECT'))).toBe(true);
  });

  it('contentEditable 的容器算可编辑（isContentEditable 会把后代也算进去，不用 closest 判属性）', () => {
    expect(isEditableTarget(target('DIV', { editable: true }))).toBe(true);
  });

  it('按钮、普通 div、body 都不算可编辑', () => {
    expect(isEditableTarget(target('BUTTON'))).toBe(false);
    expect(isEditableTarget(target('DIV'))).toBe(false);
    expect(isEditableTarget(target('BODY'))).toBe(false);
  });

  it('拿不到形状的目标（null / 没有 tagName）一律不算：宁可不放手，也不要因为判据崩了把快捷键全废掉', () => {
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget({} as unknown as EventTarget)).toBe(false);
  });
});

describe('控件族的判据（Space 归原生激活）', () => {
  it('焦点落在按钮 / 链接 / role 控件里时，Space 不许被劫走', () => {
    expect(isControlTarget(target('BUTTON', { control: 'BUTTON' }))).toBe(true);
    // 按钮里的 <span>：closest 往上找到了按钮
    expect(isControlTarget(target('SPAN', { control: 'BUTTON' }))).toBe(true);
    expect(isControlTarget(target('SPAN', { control: 'A' }))).toBe(true);
    expect(isControlTarget(target('SPAN', { control: 'DIV' }))).toBe(true); // role=… 的边界，见下一个用例
  });

  it('普通 div / body / 拿不到形状的目标不算控件：玩法键照旧', () => {
    expect(isControlTarget(target('DIV'))).toBe(false);
    expect(isControlTarget(target('BODY'))).toBe(false);
    expect(isControlTarget(null)).toBe(false);
  });

  it('输入控件不是"控件族"：它是另一条判据（不把两件事混成一件，调用点才读得懂）', () => {
    expect(isControlTarget(target('INPUT'))).toBe(false);
  });
});
