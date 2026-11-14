import { ARROW_SOURCE_NEEDS, type ShotCamera, type ShotTransition, type StoryboardArrow } from '@nexus/video-model';

/**
 * 分镜的显示名：Studio 面板与公开的分镜页读**同一份**。
 * 两处各写一份的话，改一个机位名会让"作者看到的中景"与"访客看到的中景"漂成两个词（§159）。
 * 表是 `Record<枚举, string>`：模型里加一个机位/转场/箭头，这里不补一格就编译不过。
 *
 * v755：`*_LABELS_EN` 是同一枚举的英文名（键顺序与中文表严格对齐）；
 * 面板按 `locale` 取表，不另写一份规则。公开分镜页仍是中文面，等该页 i18n 那一格。
 */
export const CAMERA_LABELS: Record<ShotCamera, string> = {
  wide: '宽景',
  medium: '中景',
  close: '特写',
  detail: '细部',
  tracking: '跟移',
  aerial: '航拍',
};

export const CAMERA_LABELS_EN: Record<ShotCamera, string> = {
  wide: 'Wide',
  medium: 'Medium',
  close: 'Close-up',
  detail: 'Detail',
  tracking: 'Tracking',
  aerial: 'Aerial',
};

export const TRANSITION_LABELS: Record<ShotTransition, string> = {
  cut: '硬切',
  fade: '淡入',
  dissolve: '叠化',
  wipe: '划像',
};

export const TRANSITION_LABELS_EN: Record<ShotTransition, string> = {
  cut: 'Cut',
  fade: 'Fade in',
  dissolve: 'Dissolve',
  wipe: 'Wipe',
};

/**
 * §40 的四条箭头在界面上的名字。短名单（时间线头部那一行用），
 * 选项后面那半句"要什么"从 `ARROW_SOURCE_NEEDS` 推——两层文案各写一份就会漂成
 * "选项说要参考图、切的时候却不要"。
 */
export const ARROW_LABELS: Record<StoryboardArrow, string> = {
  'text-to-video': '文字 → 视频',
  'image-to-video': '参考图 → 视频',
  'storyboard-to-video': '分镜 → 视频',
  'character-to-scene': '角色 → 场景',
};

export const ARROW_LABELS_EN: Record<StoryboardArrow, string> = {
  'text-to-video': 'Text → Video',
  'image-to-video': 'Reference image → Video',
  'storyboard-to-video': 'Storyboard → Video',
  'character-to-scene': 'Character → Scene',
};

/** 面板按 locale 取机位/转场/箭头的显示名（EN 表逐键对齐） */
export function cameraLabel(camera: ShotCamera, locale: 'zh' | 'en'): string {
  return (locale === 'en' ? CAMERA_LABELS_EN : CAMERA_LABELS)[camera];
}
export function transitionLabel(transition: ShotTransition, locale: 'zh' | 'en'): string {
  return (locale === 'en' ? TRANSITION_LABELS_EN : TRANSITION_LABELS)[transition];
}
export function arrowLabel(arrow: StoryboardArrow, locale: 'zh' | 'en'): string {
  return (locale === 'en' ? ARROW_LABELS_EN : ARROW_LABELS)[arrow];
}

/** 这条箭头要什么（选项标签的后半句）。读需求表，不另写一份规则 */
export function arrowNeedText(arrow: StoryboardArrow, locale: 'zh' | 'en' = 'zh'): string {
  const needs = ARROW_SOURCE_NEEDS[arrow];
  if (locale === 'en') {
    if (needs.referenceAssetId) return 'needs one pinned reference image';
    if (needs.characterId) return 'needs a character in this project';
    if (arrow === 'storyboard-to-video') return 'renders from this shot list';
    return 'needs only the sentence';
  }
  if (needs.referenceAssetId) return '要一张已定格的参考图';
  if (needs.characterId) return '要一位本项目的角色';
  if (arrow === 'storyboard-to-video') return '按这份镜头表出片';
  return '只要那句话';
}
