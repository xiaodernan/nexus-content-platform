import type { DeadLetterEntry, DeadLetterSink } from './jobQueue';

/** 摘要长度上限：够认出"是哪一类作业"，又不把整段通知 payload 复制进账本（隐私 + 有界）。 */
export const DEAD_LETTER_PREVIEW_LIMIT = 120;

/**
 * 把任意 body（可能是 JSON 字符串、对象、或解析失败的原样串）压成定长摘要。
 * 纯函数、永不抛：毒条目的 body 本来就可能不是合法 JSON，摘要这一步不能再制造第二个错。
 */
export function bodyPreview(body: unknown): string {
  let text: string;
  if (body === null || body === undefined) text = '';
  else if (typeof body === 'string') text = body;
  else {
    try {
      text = JSON.stringify(body);
    } catch {
      // JSON.stringify 只在循环引用 / BigInt / toJSON 抛错时走到这里；对对象直接 String()
      // 只会得到 "[object Object]"（还触发 no-base-to-string），记类型更有用且同样永不抛。
      text = `[unstringifiable ${typeof body}]`;
    }
  }
  // 折叠换行，避免一条日志撑成多行、也避免摘要里混入控制字符。
  text = text.replace(/\s+/g, ' ');
  return text.length > DEAD_LETTER_PREVIEW_LIMIT ? `${text.slice(0, DEAD_LETTER_PREVIEW_LIMIT)}…` : text;
}

/** 错误 → 稳定的人话 reason；不保留堆栈（堆栈属于 first-现场日志，不属于可查询账本的一行）。 */
export function errorReason(err: unknown): string {
  if (err instanceof Error) return err.message;
  const text = String(err);
  return text.length > DEAD_LETTER_PREVIEW_LIMIT ? `${text.slice(0, DEAD_LETTER_PREVIEW_LIMIT)}…` : text;
}

interface MakeArgs {
  kind: DeadLetterEntry['kind'];
  type: string;
  attempts: number;
  err?: unknown;
  body?: unknown;
  at?: number;
  /** 自定义 reason。给"body 是合法 JSON、但语义不合规"的 poison 用（schema 不符 / 未知 type）——
   *  它们不是 unparseable body，也不值得为传一句话造一个 Error。不传时沿用下面的默认分流。 */
  reason?: string;
}

/** 造一条终态记录。纯函数（时间可注入），两驱 + worker/handler 共用同一形状，杜绝形状漂移。 */
export function makeDeadLetter({ kind, type, attempts, err, body, at, reason }: MakeArgs): DeadLetterEntry {
  return {
    kind,
    type,
    attempts,
    reason: reason ?? (err === undefined ? (kind === 'poison' ? 'unparseable job body' : 'handler failed') : errorReason(err)),
    at: at ?? Date.now(),
    bodyPreview: bodyPreview(body),
  };
}

/**
 * 缺省 sink：只记日志，等价 v661 的 "dead-letter by log"。两驱不设 onDeadLetter 时用它，
 * 保证本片不改变默认行为（advisory lane 不擅自多存一份状态）。
 */
export const consoleDeadLetterSink: DeadLetterSink = (entry) => {
  if (entry.kind === 'poison') {
    console.error(`[job-queue] POISON (acked away): ${entry.type} — ${entry.reason}`);
  } else {
    console.error(`[job-queue] DROPPED after ${entry.attempts} attempts: ${entry.type} — ${entry.reason}`);
  }
};
