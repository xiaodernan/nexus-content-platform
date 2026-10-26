/**
 * Studio 的只读闸（viewer 角色）：界面先一步把编辑按下去，服务端的 403 是最后一道。
 *
 * 为什么是模块级开关而不是每个 store 各带一份：world / game / storyboard 三个 store
 * 本来就是模块单例，壳体只有一处知道"我是 viewer"；四个 store 各存一份只会分叉。
 * 设计 store 的实例测试也读同一个开关，所以测试之间要显式复位（`setStudioReadOnly(false)`）。
 *
 * 只读不等于"藏起来"：界面照常展示文档与面板，横幅把"不能改"说在前面；
 * 被按下的编辑不会进撤销栈、也不会排队等保存。唯一的例外是 activePageId / activeMode
 * 这类**视图偏好**：翻别的页面、看别的模式是"看"而不是"改"，它们照旧在本地生效，
 * 只是不标脏、不写库——下次载入服务端那份时自然回到原值。
 */
let readOnly = false;

export function setStudioReadOnly(value: boolean): void {
  readOnly = value;
}

export function isStudioReadOnly(): boolean {
  return readOnly;
}
