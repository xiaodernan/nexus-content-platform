/**
 * 「星图⇄编年 双向联动」的纯函数核心（v710 展望 · §C 落地，2026-11-14）。
 *
 * 规则（与两边投影同一口径，不发明第三个真值）：
 * - 每一卷编年（era）= 一组 story/history 条目（ChronicleEntry 的 id）；
 * - 星图里的人物通过 `profile.relationships[].target` 指向世界条目 id——
 *   若某个 target 命中本卷条目 id，该人物「活跃于此卷」；
 * - 只认一跳关系：不做传递闭包（甲→乙条目、乙（人物）→丙条目，不算甲活跃于丙之卷）——
 *   传递推断不是作者写的事实，不替作者下结论；
 * - 只认 id 精确匹配（trim 后）：空 target / 非字符串 / 指向不存在的条目都不算；
 * - 确定性：同样输入永远同样输出——人物按名字升序（中文按本地序）+ id 次级排序，
 *   viaEntryIds 保留编年条目的原始顺序去重；卷顺序保留输入顺序。
 *
 * 零依赖、纯函数、零 IO：Chronicle 页在服务端算好，星图页零侵入。
 */

/** 章节条目的最小结构（ChronicleEntry 是其超集，本模块不关心标题/order/时间）。 */
export interface EraTieEntry {
  id: string;
}

export interface EraTieEra {
  era: string;
  entries: readonly EraTieEntry[];
}

/** 人物的最小结构——真实 Character 结构兼容（structural typing）。 */
export interface EraTieCharacter {
  id: string;
  profile: {
    name?: string | null | undefined;
    relationships?: readonly { target?: string | null | undefined; kind?: string | null | undefined }[] | null | undefined;
  };
}

export interface EraTieFigure {
  id: string;
  /** 展示名 = trim(name)，空 → 回退 id（不编造名字） */
  name: string;
  /** 指向本卷的条目 id，按编年原顺序去重 */
  viaEntryIds: string[];
}

export interface EraTie {
  era: string;
  viaEntryCount: number;
  linkedCharacters: EraTieFigure[];
}

export function buildEraTies(
  eras: readonly EraTieEra[],
  characters: readonly EraTieCharacter[],
): EraTie[] {
  // 预解析每个人物的目标条目 id 列表（trim + 去重），与输入结构解耦
  const parsedChars = characters
    .filter((c) => c && typeof c.id === 'string' && c.id.trim() !== '')
    .map((c) => {
      const rels = c.profile?.relationships;
      const targets = new Set<string>();
      if (Array.isArray(rels)) {
        for (const rel of rels) {
          const raw = typeof rel?.target === 'string' ? rel.target.trim() : '';
          if (raw) targets.add(raw);
        }
      }
      const name = typeof c.profile?.name === 'string' ? c.profile.name.trim() : '';
      return { id: c.id, name: name === '' ? c.id : name, targets };
    });

  return eras.map((era) => {
    const entryIds: string[] = [];
    const entrySet = new Set<string>();
    for (const entry of era.entries) {
      const raw = typeof entry?.id === 'string' ? entry.id.trim() : '';
      if (!raw || entrySet.has(raw)) continue;
      entrySet.add(raw);
      entryIds.push(raw);
    }

    const figures: EraTieFigure[] = [];
    for (const pc of parsedChars) {
      const via = entryIds.filter((id) => pc.targets.has(id)); // 保留编年顺序
      if (via.length > 0) figures.push({ id: pc.id, name: pc.name, viaEntryIds: via });
    }
    figures.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name);
      return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
    });
    return { era: era.era, viaEntryCount: entryIds.length, linkedCharacters: figures };
  });
}
