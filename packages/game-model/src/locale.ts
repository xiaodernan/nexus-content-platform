/**
 * 模型层的语言标记：投影（编译产物里的如实说明、报告、事件）按它选语言。
 * 默认 'zh'——旧调用方与单测一个字都不用改；界面按服务端 cookie locale 传 'en'。
 */
export type ModelLocale = "zh" | "en";

/** 二选一的小工具，消除 if/else 噪音 */
export function L<T>(locale: ModelLocale | undefined, zh: T, en: T): T {
  return locale === "en" ? en : zh;
}
