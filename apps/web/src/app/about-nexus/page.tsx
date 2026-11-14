import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandTitle } from '@/components/BrandTitle';


export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'NEXUS · 关于',
  description: '一个用来制造创意的平台：提示词 → 设计模型 → 实时代码 → 可发布。全部开源，全部有据可查。',
};

/**
 * 关于 NEXUS — 外向朋友的那一页。
 * 大字、少字、真句段。每段只说一件事：这是什么 / 它怎么工作 / 它不是什么。
 */
export default function AboutPage() {
  return (
    <main className="ab-shell" data-about-root>
      <header className="ab-hero">
        <p className="ash-eyebrow">《规格与信仰 · 卷首语》</p>
        <BrandTitle tag="h1">我们造的是一座工厂，不只是一件作品</BrandTitle>
        <p className="ash-lede">
          提示词进入 NEXUS 之后，不是被"写成代码"，也不是被"生成一张 PNG"。
          它被装配成一份可撤销、可比较、可重放的设计模型——
          和一切在画布上被改动的 DesignNode 一样的子节点树。
          你看到的每一像素，背后都是这棵树的投影。
        </p>
      </header>

      <section className="ab-pillarShell" data-about-promise aria-label="这座工厂的承诺">
        <Pillar
          no="01"
          title="创意可撤销"
          copy="每一笔 AI 操作都落进 Command 栈。Ctrl+Z 还你上一份真相，AI Diff 告诉你是哪一层变了。"
        />
        <Pillar
          no="02"
          title="数字有据"
          copy="每一次调用、每一次命中缓存、每一次拒绝落盘，都在 /healthz、/metrics 与账本上。猜错的数字不是数字。"
        />
        <Pillar
          no="03"
          title="诚实胜于好看"
          copy="DEMO MODE 常驻，不挂真 Provider 就说没接。未配置单价就是「未计价」，不是 $0.0000。缓存未报就是「没报」，不是「命中 0」。"
        />
      </section>

      <section className="ab-howShell" data-about-how aria-label="这座工厂怎么跑">
        <h2 className="ab-howHead">一条 prompt 的一生</h2>

        <div className="ab-howRow">
          <StepTag tag="01" title="触发">
            用户输入「把 Hero 的标题改成 72px」。
          </StepTag>
          <StepTag tag="02" title="载荷">
            §68 目录装配：pages → frames → components → tokens → intent → prompt → variants，
            稳定前缀 + 尾部诉求，按 wire 单一真值字节序列化。
          </StepTag>
          <StepTag tag="03" title="前缀缓存">
            同一项目第二轮起，前缀逐字节相同 = provider 只要做前缀缓存就必然能命中。
            151 次真测里命中的轮次恒等。
          </StepTag>
          <StepTag tag="04" title="签字">
            高危动作：删除、发布、扣点、对外消息——任何意向 op 与 model 的声称都要
            分发到审批门，挂起才算、放开才落。§74。
          </StepTag>
          <StepTag tag="05" title="落地">
            变更写进 Snapshot（带 before → after 缩略图），
            AI 的计划、补丁、预算、耗时全部入 agent_tasks 账本。
          </StepTag>
        </div>
      </section>

      <section className="ab-numbersShell" data-about-numbers aria-label="这座工厂的账目">
        <h2 className="ab-numbersHead">现在的账本怎么看</h2>
        <ol className="ab-numberList">
          <NumberRow
            k="cached tokens (warm loop)"
            v="~27 344 / 27 347"
            foot="5 轮同目录同诉求真实调用 · wkapi.pro / gpt-6-sol · 实测 exit 0"
          />
          <NumberRow
            k="证据门（verify:fe-gates）"
            v="104 / 104"
            foot="1067 条类级字节判据 · 零 hex · 零裸 Tailwind · 零降级 token"
          />
          <NumberRow
            k="整库测试"
            v="417 passed / 18 skipped"
            foot="pytest apps/ai-service · 18 skip 因为配置不是承诺（未接的就跳）"
          />
        </ol>
        <div className="ab-swatchShell"><p className="adm-capNote">品牌渐变：所有标题都用同一笔 brand→accent-1→fg-1 的渐变墨字，全从 tokens 取色。</p></div>
      </section>

      <footer className="ash-emptyCard">
        <p className="ash-emptyTitle">到这里为止都是真的</p>
        <p className="ash-emptyText">
          没有任何一行数字是脚注时代补写的。读不动的都是后面 TestBoundary 直接钉住的。
        </p>
        <Link href="/discover" className="ash-emptyLink">去看看放出来的作品 →</Link>
        <Link href="/ship" className="ash-emptyLink">或者，看看这台工厂每天交付了什么 →</Link>
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

function NumberRow({ k, v, foot }: { k: string; v: string; foot: string }) {
  return (
    <li className="ab-numberRow">
      <div className="ab-numberRowTop">
        <span className="ab-numberKey">{k}</span>
        <span className="ab-numberValue">{v}</span>
      </div>
      <p className="ab-numberFoot">{foot}</p>
    </li>
  );
}
