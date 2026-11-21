/**
 * §44 世界填料的纯函数半：把模型回话解析成可落库的世界条目。
 *
 * 纪律（§159）：这里只做形状判定，不生成内容、不写库，也不给"看起来像生成"的兜底。
 * 模型没按 JSON 回、条数为 0、字段不是字符串——全部返回 []，界面照实说没有拿到可用条目。
 * 长度上限与世界模型的 zod 约束对齐：title ≤ 120，body ≤ 4000（这里收得更紧，
 * 填料是一段能读的细节，不是把整本设定集塞进一个节点）。
 */
export type WorldFillEntry = { title: string; body: string; era?: string };

const MAX_ENTRIES = 2;
const MAX_TITLE = 120;
const MAX_BODY = 4000;

/** 剥掉 ```json 围栏后取第一个 JSON 值；解析失败返回 null，不抛。 */
export function parseWorldFillReply(text: string): WorldFillEntry[] {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  if (!cleaned) return [];
  let value: unknown;
  try {
    value = JSON.parse(cleaned);
  } catch {
    return [];
  }
  const raw = Array.isArray(value) ? value : (value as { entries?: unknown })?.entries;
  if (!Array.isArray(raw)) return [];
  const out: WorldFillEntry[] = [];
  for (const item of raw) {
    if (out.length >= MAX_ENTRIES) break;
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const title = typeof obj.title === 'string' ? obj.title.trim() : '';
    const body = typeof obj.body === 'string' ? obj.body.trim() : '';
    if (!title || !body || title.length > MAX_TITLE || body.length > MAX_BODY) continue;
    // era 是编年续写才有的可选字段：必须是短字符串，否则当没写，不让模型把长话塞进纪元名
    const era = typeof obj.era === 'string' && obj.era.trim().length > 0 && obj.era.trim().length <= 80
      ? obj.era.trim()
      : undefined;
    out.push(era ? { title, body, era } : { title, body });
  }
  return out;
}

/**
 * 编年续写：模型必须挑一个**已经存在的纪元**（或空串表示"无纪元"），不许自造纪元名——
 * 编年页的 era 是作者字面，模型只在该字面下补一条故事，不替作者发明历史分期。
 */
export function parseChronicleReply(text: string, eras: readonly string[]): (WorldFillEntry & { era: string }) | null {
  const entry = parseWorldFillReply(text)[0];
  if (!entry) return null;
  const era = entry.era && eras.includes(entry.era) ? entry.era : '';
  return { title: entry.title, body: entry.body, era };
}

/**
 * 记忆回声（§44）：≤240 字的感官刻痕，不是剧情梗概。模型给的正文超长直接拒绝，
 * 不截断——截断出来的半句话比没有更糟。
 */
export function parseEchoReply(text: string): string | null {
  const entry = parseWorldFillReply(text)[0];
  if (!entry || entry.body.length > 240) return null;
  return entry.body;
}
