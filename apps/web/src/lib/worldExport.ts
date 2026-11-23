/**
 * 世界文档 → Markdown 的纯投影（§16：设计模型是唯一真值，这里只是另一种视图）。
 * 零 provider、零网络、零副作用；同样输入永远同样输出，便于单测与人工核对。
 */
import {
  WORLD_KINDS, WORLD_KIND_LABELS, WORLD_KIND_LABELS_EN,
  addWorldNode, updateWorldNode,
  type WorldDocument, type WorldKind, type WorldNode,
} from '@nexus/world-model';

const esc = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();

function nodeLine(n: WorldNode, locale: 'zh' | 'en'): string {
  const era = n.lore?.era ? (locale === 'zh' ? `（纪元：${n.lore.era}${typeof n.lore?.order === 'number' ? ` · ${n.lore.order}` : ''}）` : ` (era: ${n.lore.era}${typeof n.lore?.order === 'number' ? ` · ${n.lore.order}` : ''})`) : '';
  const memory = n.lore?.memory?.trim()
    ? `\n  - ${locale === 'zh' ? '记忆回声：' : 'Memory echo: '}${esc(n.lore.memory)}`
    : '';
  return `- **${esc(n.title)}**${era}\n  - ${esc(n.body || (locale === 'zh' ? '（还没有正文）' : '(no body yet)'))}${memory}`;
}

/** 按九类固定顺序导出，空类也留标题——读者能看出哪些地还是空的。 */
export function worldToMarkdown(world: WorldDocument, locale: 'zh' | 'en' = 'zh'): string {
  const title = world.name?.trim() || (locale === 'zh' ? '未命名世界' : 'Untitled world');
  const lines: string[] = [`# ${title}`, ''];
  if (world.summary?.trim()) lines.push(world.summary.trim(), '');
  for (const kind of WORLD_KINDS) {
    const label = locale === 'en' ? WORLD_KIND_LABELS_EN[kind] : WORLD_KIND_LABELS[kind];
    lines.push(`## ${label}`, '');
    const nodes = world.nodes.filter((n) => n.kind === kind);
    if (nodes.length === 0) lines.push(locale === 'zh' ? '_（空）_' : '_(empty)_', '');
    else for (const n of nodes) lines.push(nodeLine(n, locale), '');
  }
  return lines.join('\n');
}

export type ImportedWorld = {
  name: string;
  summary: string;
  entries: { kind: string; title: string; body: string; era?: string; order?: number; memory?: string }[];
};

/**
 * Markdown → 世界条目的严格解析。只认本模块导出的那套形状；不认识的节/字段直接忽略或判失败，
 * 绝不把模型话术或用户随手写的自由文本悄悄当成设定（§159）。
 */
export function parseWorldMarkdown(md: string): ImportedWorld | null {
  const lines = md.split(/\r?\n/);
  const titleIdx = lines.findIndex((l) => /^# /.test(l));
  if (titleIdx < 0) return null;
  const name = lines[titleIdx]!.slice(2).trim();
  if (!name || name.length > 120) return null;

  const kindByLabel = new Map<string, string>();
  for (const k of WORLD_KINDS) {
    kindByLabel.set(WORLD_KIND_LABELS[k], k);
    kindByLabel.set(WORLD_KIND_LABELS_EN[k], k);
  }

  // 概述：标题后的第一段非空文本；碰到任何标题就停
  let summary = '';
  for (let i = titleIdx + 1; i < lines.length; i++) {
    const l = lines[i]!.trim();
    if (!l) continue;
    if (/^#/.test(l)) break;
    summary = l.slice(0, 4000);
    break;
  }

  const entries: ImportedWorld['entries'] = [];
  let kind: string | null = null;
  let current: ImportedWorld['entries'][number] | null = null;
  let readingBody = false;
  for (let i = titleIdx + 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (/^## /.test(line)) {
      kind = kindByLabel.get(line.slice(3).trim()) ?? null;
      current = null;
      readingBody = false;
      continue;
    }
    // 记忆回声（导出格式里它紧跟在正文之后）
    const mem = line.match(/^- (?:记忆回声：|Memory echo: )(.*)$/);
    if (mem && current && current.body) {
      current.memory = mem[1]!.trim().slice(0, 240);
      readingBody = false;
      continue;
    }
    // 条目标题行
    const m = line.match(/^- \*\*(.+?)\*\*(?:（纪元：([^）]+)）| \(era: ([^)]+)\))?$/);
    if (m) {
      const title = m[1]!.trim();
      if (!title || title.length > 120 || !kind) {
        current = null;
        readingBody = false;
        continue;
      }
      const eraRaw = (m[2] ?? m[3] ?? '').trim();
      const parts = eraRaw.split('·').map((p) => p.trim());
      const order = parts.length > 1 && /^\d+$/.test(parts[1]!) ? Number(parts[1]) : undefined;
      current = {
        kind, title, body: '',
        ...(parts[0] ? { era: parts[0] } : {}),
        ...(order !== undefined ? { order } : {}),
      };
      entries.push(current);
      readingBody = true;
      continue;
    }
    // 正文：紧跟条目标题的第一段 `- ...`，占位文本不算正文
    if (readingBody && line.startsWith('- ') && current && !current.body) {
      const body = line.slice(2).trim();
      if (body && body !== '（还没有正文）' && body !== '(no body yet)') current.body = body.slice(0, 4000);
      readingBody = false;
    }
  }

  const valid = entries.filter((e) => e.body);
  return valid.length ? { name, summary, entries: valid } : null;
}

/** 导入结果：只追加、不覆盖既有条目；未知类别跳过并计数，不静默丢弃（§159）。 */
export type ImportOutcome = { document: WorldDocument; added: number; skipped: number };

export function mergeImportedWorld(world: WorldDocument, imported: ImportedWorld): ImportOutcome {
  let doc: WorldDocument = world;
  let added = 0;
  let skipped = 0;
  for (const e of imported.entries) {
    if (!WORLD_KINDS.includes(e.kind as WorldKind)) { skipped += 1; continue; }
    doc = addWorldNode(doc, { kind: e.kind as WorldKind, title: e.title, body: e.body });
    const id = doc.nodes[doc.nodes.length - 1]!.id;
    const lore = {
      ...(e.era ? { era: e.era } : {}),
      ...(e.order !== undefined ? { order: e.order } : {}),
      ...(e.memory ? { memory: e.memory } : {}),
    };
    if (Object.keys(lore).length) doc = updateWorldNode(doc, id, { lore });
    added += 1;
  }
  return { document: doc, added, skipped };
}

export function worldFileName(world: WorldDocument): string {
  const slug = (world.name || 'world').replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'world';
  return `${slug}.world.md`;
}
