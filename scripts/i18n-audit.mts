// i18n-audit.mts — 中英文合规检查（模型驱动，2026-11-20）。
// 把 GUIDE_COPY（内置说明书字典，同一份字典服务抽屉 + /guide）中每段 zh 和 en 的第一句，
// 喂给真 provider：
//   - zh→en：检查英文翻译是否忠实、无中文留白、无明显「翻译腔」；列出要改的句
//   - en→zh：检查中文翻译是否写回原文含义，列出不一致处
// 产出 docs/i18n-audit-2026-11-20.md + stdout 汇总。任何失败如实报告，不伪造。
import { writeFileSync } from 'node:fs';
import { GUIDE_COPY, type GuideSection } from '../apps/web/src/lib/guideCopy';
import { chatWithCharacter } from '../apps/web/src/server/ai/client';

const SYSTEM = `你是文档合规审核员（严格、无创造性改写）。任务：检查双语文案对照。
输出 JSON：{"issues":[{"id":"zh第N段或en第N段","side":"zh|en","reason":"..."}],"notes":"..."}
检查点：① 英文译文是否忠实（含绝不该出现的中文字符/日文/繁体词）② 译文是否是自然英语或自然中文（无翻译腔）③ 是否含错别字
只输出 JSON，不解释。`;

const jattack = async (text: string): Promise<{ id: string; side: string; reason: string }[]> => {
  const r = await chatWithCharacter({
    requestId: `i18n-audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    system: SYSTEM,
    user: text,
    modelClass: 'balanced',
  });
  if (!r.ok) return [{ id: 'audit', side: 'zh', reason: `AI 调用未成功：${r.error?.message ?? 'provider 不可用'}` }];
  try {
    const obj = JSON.parse(r.response.text.replace(/^```(?:json)?\s*/, '').replace(/\s*```\s*$/, ''));
    return Array.isArray(obj.issues) ? obj.issues : [{ id: 'parse', side: 'zh', reason: `AI 输出无 issues 数组：${r.response.text.slice(0, 120)}` }];
  } catch {
    return [{ id: 'parse', side: 'zh', reason: `AI 输出不是合法 JSON：${r.response.text.slice(0, 120)}` }];
  }
};

function head(s: GuideSection): string {
  return s.heading + ' :: ' + (s.body[0] ?? '');
}

async function main(): Promise<void> {
  const lines: string[] = [];
  let issuesTotal = 0;
  const zh = GUIDE_COPY.zh.sections as GuideSection[];
  const en = GUIDE_COPY.en.sections as GuideSection[];

  for (let i = 0; i < zh.length; i++) {
    const zhHead = head(zh[i]);
    const enHead = head(en[i]);
    const text = `zh 第 ${i + 1} 段 "${zhHead}"\nen 第 ${i + 1} 段 "${enHead}"\n请检查这一对：zh 语义内容是否全部在 en 翻译中出现（en 没缺必须翻译内容）；en 译文是否忠实（无中文字符、无繁体、无明显翻译腔）。列出差异。`;
    const issues = await jattack(text);
    issuesTotal += issues.length;
    lines.push(`## 第 ${i + 1} 段：${zh[i].heading} · ${en[i].heading}`);
    lines.push(`- zh: ${zhHead.slice(0, 90)}`);
    lines.push(`- en: ${enHead.slice(0, 90)}`);
    if (issues.length === 0) lines.push('- 诊断: AI 未报问题');
    else issues.forEach((x) => lines.push(`- ${x.side} issue: ${x.reason}`));
    lines.push('');
    console.log(`第 ${i + 1} 段（${zh[i].heading}）：${issues.length} 项差异`);
  }

  // 全局忠实度抽样：en→zh
  for (let i = 0; i < zh.length; i++) {
    const text = `en 第 ${i + 1} 段 "${head(en[i])}"\nzh 第 ${i + 1} 段 "${head(zh[i])}"\n这一对是项目文案：检查 en 翻译回来的中文是否比 zh 原文摘除主要关键名/数字外内容一致。列出出现在 zh 原文里的关键名但缺失/翻译错误在 en 中的项。`;
    const issues = await jattack(text);
    issuesTotal += issues.length;
    lines.push(`## 第 ${i + 1} 段（en→zh）：${en[i].heading}`);
    if (issues.length === 0) lines.push('- AI 未报问题');
    else issues.forEach((x) => lines.push(`- ${x.side} issue: ${x.reason}`));
    lines.push('');
  }

  // 报告按运行当天落档：重跑一次不该把上一次的审计记录覆盖掉（2026-11-21）
  const stamp = new Date().toISOString().slice(0, 10);
  const outPath = `docs/i18n-audit-${stamp}.md`;
  const report = [`# 中英文合规审计报告（${stamp}）`, '', `总差异：${issuesTotal} 项`, '', ...lines];
  writeFileSync(outPath, report.join('\n'));
  console.log(`报告已写 ${outPath} · 总差异：${issuesTotal} 项`);
}

void main().catch((e) => {
  console.error('i18n-audit 致命错误：', e);
  process.exit(1);
});
