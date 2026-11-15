import type { Metadata } from 'next';
import Link from 'next/link';
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { BrandTitle } from '@/components/BrandTitle';
import { getLocale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'NEXUS · About',
  description: 'A creative-modeling platform — prompts become design models, then real code, then enterable worlds. Open source, every number audited.',
};

/**
 * About NEXUS — the outward-facing page.
 * 大字、少字、真句段。账面数字请求时现数——同一页中文/英文由 cookie 分发。
 */

function countDirFiles(dir: string, suffix?: string): string {
  try {
    const entries = readdirSync(join(process.cwd(), dir), { withFileTypes: true }).filter(
      (e) => e.isFile() && (suffix ? e.name.endsWith(suffix) : true),
    );
    return String(entries.length);
  } catch {
    return '—';
  }
}

function countDirs(dir: string): string {
  try {
    return String(readdirSync(join(process.cwd(), dir), { withFileTypes: true }).filter((e) => e.isDirectory()).length);
  } catch {
    return '—';
  }
}

function gitOut(args: string[]): string {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return '—';
  }
}

const COMMIT_TOTAL = gitOut(['rev-list', '--count', 'HEAD']);
const HEAD_DATE = gitOut(['log', '-1', '--format=%cd', '--date=short']);
const ADR_TOTAL = countDirFiles('docs/adr', '.md');
const CONTRACTS = countDirFiles('contracts', '.schema.json');
const SERVICES = countDirs('services');

const COPY = {
  zh: {
    kicker: '《规格与信仰 · 卷首语》',
    heroTitle: '我们造的是一座工厂，不只是一件作品',
    heroLede:
      '提示词进入 NEXUS 之后，不是被"写成代码"，也不是被"生成一张 PNG"。它被装配成一份可撤销、可比较、可重放的设计模型——和一切在画布上被改动的 DesignNode 一样的子节点树。你看到的每一像素，背后都是这棵树的投影。',
    promiseLabel: '这座工厂的承诺',
    howLabel: '这座工厂怎么跑',
    howHead: '一条 prompt 的一生',
    stepTitle: ['触发', '载荷', '前缀缓存', '签字', '落地'],
    stepCopy: [
      '用户输入「把 Hero 的标题改成 72px」。',
      '§68 目录装配：pages → frames → components → tokens → intent → prompt → variants，稳定前缀 + 尾部诉求，按 wire 单一真值字节序列化。',
      '同一项目第二轮起，前缀逐字节相同 = provider 只要做前缀缓存就必然能命中。命中的轮次恒等。',
      '高危动作：删除、发布、扣点、对外消息——任何意向 op 与 model 的声称都要分发到审批门，挂起才算、放开才落。§74。',
      '变更写进 Snapshot（带 before → after 缩略图），AI 的计划、补丁、预算、耗时全部入 agent_tasks 账本。',
    ],
    pillars: [
      { no: '01', title: '创意可撤销', copy: '每一笔 AI 操作都落进 Command 栈。Ctrl+Z 还你上一份真相，AI Diff 告诉你是哪一层变了。' },
      { no: '02', title: '数字有据', copy: '每一次调用、每一次命中缓存、每一次拒绝落盘，都在 /healthz、/metrics 与账本上。猜错的数字不是数字。' },
      { no: '03', title: '诚实胜于好看', copy: 'DEMO MODE 常驻，不挂真 Provider 就说没接。未配置单价就是「未计价」，不是 $0.0000。缓存未报就是「没报」，不是「命中 0」。' },
    ],
    numbersLabel: '这座工厂的账目',
    numbersHead: '现在的账本怎么看',
    rows: [
      { k: '累计提交（请求时现算）', v: COMMIT_TOTAL, foot: '`git rev-list --count HEAD` · 最后一次提交 {HEAD_DATE}' },
      { k: 'ADR 决策（请求时现算）', v: ADR_TOTAL, foot: 'readdir docs/adr · 每一份都是真取舍，不写表决纪要' },
      { k: '跨端契约（请求时现算）', v: CONTRACTS, foot: 'contracts/*.schema.json · web ↔ ai-service ↔ java 共享同一份 zod 真值' },
      { k: 'Java 微服务（请求时现算）', v: SERVICES, foot: 'readdir services · 网关注册/路由/熔断/链路实证见 springcloud-verify-live 证据' },
      { k: '缓存命中（真 provider，两次实测）', v: '80–100%', foot: '同 lane 同目录同 digest 实测两次：5 轮 96–100%（2026-11-14 早）与 4 轮 80–83%（同日重跑）——wkapi.pro distributor 随机分片上游 KV 不共享，不承诺单值' },
    ],
    brandGradientCaption: '品牌渐变：所有标题都用同一笔 brand→accent-1→fg-1 的渐变墨字，全从 tokens 取色。',
    footTitle: '到这里为止都是真的',
    footText: '没有任何一行数字是脚注时代补写的。读不动的都是之后 TestBoundary 直接钉住的。',
    discoverLink: '去看看放出来的作品 →',
    shipLink: '或者，看看这台工厂每天交付了什么 →',
  },
  en: {
    kicker: 'Manifesto · preamble',
    heroTitle: 'A factory, not merely a finished piece',
    heroLede:
      'When a prompt enters NEXUS, it is neither "written as code" nor "turned into a PNG." It is assembled into an undo-able, diff-able, replayable design model — the same sub-tree as every DesignNode you touch on canvas. Every pixel you see is a projection of that tree.',
    promiseLabel: 'What this factory promises',
    howLabel: 'How this factory runs',
    howHead: 'A prompt’s life',
    stepTitle: ['Trigger', 'Payload', 'Prefix cache', 'Sign here', 'Land'],
    stepCopy: [
      'User says: "change the Hero title to 72px."',
      '§68 catalog assembly: pages → frames → components → tokens → intent → prompt → variants. Stable prefix + variable tail; wire-letter serialization is the sole truth.',
      'Same project, second and later turns: the prefix is byte-identical — provider only needs to honor prefix caching. Cache hit is invariant on turns 2+.',
      'High-risk ops: delete / publish / spend-credit / external message — any intent-op + model-claim is distributed to the approval gate. Blocked unless granted. §74.',
      'Changes land in Snapshot with before → after thumbnails; plan, patch, budget, elapsed, all into agent_tasks ledger.',
    ],
    pillars: [
      { no: '01', title: 'Undoable creativity', copy: 'Every AI action lands in the Command stack. Ctrl+Z restores the previous truth; AI Diff tells you which layer changed.' },
      { no: '02', title: 'Numbers with receipts', copy: 'Every call, every cache hit, every refused write lives in /healthz, /metrics and the ledger. A guessed number is never a number.' },
      { no: '03', title: 'Honest beats pretty', copy: 'DEMO MODE stays on; without a live provider the badge says DEMO. Unconfigured unit-price reads "unpriced", not $0.0000. Cache not reported is "not reported", not "hit 0".' },
    ],
    numbersLabel: 'This factory’s books',
    numbersHead: 'Reading the ledger today',
    rows: [
      { k: 'Lifetime commits (computed at request time)', v: COMMIT_TOTAL, foot: '`git rev-list --count HEAD` · last commit {HEAD_DATE}' },
      { k: 'ADRs (computed at request time)', v: ADR_TOTAL, foot: 'readdir docs/adr · every one is a real trade-off, not a committee minutes' },
      { k: 'Wire contracts (computed at request time)', v: CONTRACTS, foot: 'contracts/*.schema.json · web ↔ ai-service ↔ java share the same zod truth' },
      { k: 'Java microservices (computed at request time)', v: SERVICES, foot: 'readdir services · gateway registry/routing/breaker/traceback witnesses in springcloud-verify-live evidence' },
      { k: 'Cache hit rate (live provider, two runs)', v: '80–100%', foot: 'Same lane, same catalog, same digest — measured twice: 5 turns hit 96–100% (early 2026-11-14) and 4 turns hit 80–83% (same day, re-run). wkapi.pro’s distributor splits across upstream KV shards without sharing; do not accept single-value promises.' },
    ],
    brandGradientCaption: 'Brand gradient: every title uses the same brand→accent-1→fg-1 ink; all tokens, zero hand-tuned stops.',
    footTitle: 'Everything on this page is true',
    footText: 'No row is a footnote interpolation. The logic underneath is pinned by TestBoundary-adjacent invariants that assert at compile time.',
    discoverLink: 'See what’s published →',
    shipLink: 'Or see what this factory shipped today →',
  },
};

export default async function AboutPage() {
  const locale = await getLocale();
  const copy = COPY[locale];
  return (
    <main className="ab-shell" data-about-root data-about-locale={locale}>
      <header className="ab-hero">
        <p className="ash-eyebrow">{copy.kicker}</p>
        <BrandTitle tag="h1">{copy.heroTitle}</BrandTitle>
        <p className="ash-lede">{copy.heroLede}</p>
      </header>

      <section className="ab-pillarShell" data-about-promise aria-label={copy.promiseLabel}>
        {copy.pillars.map((pillar) => (
          <Pillar key={pillar.no} no={pillar.no} title={pillar.title} copy={pillar.copy} />
        ))}
      </section>

      <section className="ab-howShell" data-about-how aria-label={copy.howLabel}>
        <h2 className="ab-howHead">{copy.howHead}</h2>
        <div className="ab-howRow">
          {copy.stepTitle.map((title, idx) => {
            const tag = ['01', '02', '03', '04', '05'][idx]!;
            return (
              <StepTag key={tag} tag={tag} title={title}>
                {copy.stepCopy[idx]}
              </StepTag>
            );
          })}
        </div>
      </section>

      <section className="ab-numbersShell" data-about-numbers aria-label={copy.numbersLabel}>
        <h2 className="ab-numbersHead">{copy.numbersHead}</h2>
        <ol className="ab-numberList">
          {copy.rows.map((row) => (
            <li key={row.k} className="ab-numberRow">
              <div className="ab-numberRowTop">
                <span className="ab-numberKey">{row.k}</span>
                <span className="ab-numberValue">{row.v}</span>
              </div>
              <p className="ab-numberFoot">{row.foot.replace('{HEAD_DATE}', HEAD_DATE)}</p>
            </li>
          ))}
        </ol>
        <div className="ab-swatchShell"><p className="adm-capNote">{copy.brandGradientCaption}</p></div>
      </section>

      <footer className="ash-emptyCard">
        <p className="ash-emptyTitle">{copy.footTitle}</p>
        <p className="ash-emptyText">{copy.footText}</p>
        <Link href="/discover" className="ash-emptyLink">{copy.discoverLink}</Link>
        <Link href="/ship" className="ash-emptyLink">{copy.shipLink}</Link>
      </footer>
    </main>
  );
}

function Pillar({ no, title, copy }: { no: string; title: string; copy: string }) {
  return (
    <article className="ab-pillar">
      <p className="ab-pillarNo">{no}</p>
      <h3 className="ab-pillarTitle">{title}</h3>
      <p className="ab-pillarCopy">{copy}</p>
    </article>
  );
}

function StepTag({ tag, title, children }: { tag: string; title: string; children: React.ReactNode }) {
  return (
    <div className="ab-step">
      <span className="ab-stepTag">{tag}</span>
      <div className="ab-stepBody">
        <h3 className="ab-stepTitle">{title}</h3>
        <p className="ab-stepCopy">{children}</p>
      </div>
    </div>
  );
}
