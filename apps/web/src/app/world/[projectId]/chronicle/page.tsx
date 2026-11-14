import { notFound } from 'next/navigation';
import { loadWorld } from '@/server/domain/worlds';
import { listCharacters } from '@/server/domain/characters';
import { loadDocument } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { requireUser } from '@/server/domain/session';
import { getLocale } from '@/lib/i18n';
import { buildChronicle } from '@/lib/chronicle';
import { buildEraTies } from '@/lib/era-ties';
import { ChronicleView } from '@/components/ChronicleView';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '世界编年 · NEXUS',
  description: '世界的年表：只读的文字投影。只有 story/history 进编年，时代来自作者 lore，不做历史感算法。',
};

/**
 * 「世界编年」—— 世界的年表。只有项目作者能进（与 /world 同一道门）。
 * 数据来自世界文档的 story/history 条目；世界读不出来 ⇒ 年表不画，页面说明缺什么（同 §500、不假装）。
 * 星图⇄编年双向联动（v710 §C）：服务端把人物 relationships 命中的本卷条目算成 ties；
 * 同时把作者声明的 activeEra 角色带进在场 chips —— 两套口径都是真值、都如实投影。
 */
export default async function ChroniclePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser();
  if (!(await projectVisibleTo(projectId, user.id))) notFound();

  const [roster, world, project] = await Promise.all([
    listCharacters(projectId),
    loadWorld(projectId),
    loadDocument(projectId),
  ]);
  if (!project) notFound();

  const worldOk = world && world.ok ? world.document : null;
  const eras = worldOk ? buildChronicle(worldOk.nodes) : [];
  const ties = buildEraTies(
    eras.map((era) => ({ era: era.era, entries: era.entries.map((entry) => ({ id: entry.id })) })),
    roster.items,
  );
  const locale = await getLocale();
  // 作者声明的在场：character.profile.activeEra === entry.era（逐字匹配，不推断）
  const characters = roster.items.map((character) => ({
    id: character.id,
    name: character.profile.name || '（没有名字）',
    activeEra: character.profile.activeEra,
  }));

  return <ChronicleView worldName={project.name} projectId={projectId} eras={eras} ties={ties} characters={characters} locale={locale} />;
}
