/**
 * 世界文档 → Markdown 的纯投影（§16：设计模型是唯一真值，这里只是另一种视图）。
 * 零 provider、零网络、零副作用；同样输入永远同样输出，便于单测与人工核对。
 */
import { WORLD_KINDS, WORLD_KIND_LABELS, WORLD_KIND_LABELS_EN, type WorldDocument, type WorldNode } from '@nexus/world-model';

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

export function worldFileName(world: WorldDocument): string {
  const slug = (world.name || 'world').replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'world';
  return `${slug}.world.md`;
}
