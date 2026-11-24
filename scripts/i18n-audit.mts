import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUIDE_COPY, type GuideSection } from '../apps/web/src/lib/guideCopy';

type AuditIssue = { id: string; side: 'zh' | 'en'; reason: string };
type AuditMode = 'offline' | 'model';
type StructureSection = Pick<GuideSection, 'heading' | 'body'>;

const SYSTEM = `你是文档合规审核员（严格、无创造性改写）。任务：检查双语文案对照。
输出 JSON：{"issues":[{"id":"zh第N段或en第N段","side":"zh|en","reason":"..."}],"notes":"..."}
检查点：① 英文译文是否忠实（含绝不该出现的中文字符/日文/繁体词）② 译文是否是自然英语或自然中文（无翻译腔）③ 是否含错别字
只输出 JSON，不解释。`;

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const ORDINAL = /^([①-⑳])/;

class AuditUnavailable extends Error {}

function head(section: GuideSection): string {
  return `${section.heading} :: ${section.body[0] ?? ''}`;
}

export function renderAuditSection(section: StructureSection): string {
  return [section.heading, ...section.body.map((paragraph, index) => `[${index + 1}] ${paragraph}`)].join('\n');
}

function issue(id: string, side: 'zh' | 'en', reason: string): AuditIssue {
  return { id, side, reason };
}

export function auditStructure(zhSections: StructureSection[], enSections: StructureSection[]): AuditIssue[] {
  const issues: AuditIssue[] = [];
  if (zhSections.length !== enSections.length) {
    issues.push(issue('sections', 'en', `章节数量不一致：zh=${zhSections.length}，en=${enSections.length}`));
  }

  const validate = (sections: StructureSection[], side: 'zh' | 'en') => {
    const seen = new Set<string>();
    for (let index = 0; index < sections.length; index++) {
      const section = sections[index]!;
      const id = `section-${index + 1}`;
      if (!section.heading.trim() || !section.body.some((paragraph) => paragraph.trim())) {
        issues.push(issue(id, side, '章节标题或正文为空'));
      }
      if (seen.has(section.heading)) issues.push(issue(`duplicate:${section.heading}`, side, `章节标题重复：${section.heading}`));
      seen.add(section.heading);
      if (side === 'en') {
        const match = CJK.exec([section.heading, ...section.body].join('\n'));
        if (match) issues.push(issue(id, side, `英文文案残留 CJK 字符：${match[0]}`));
      }
    }
  };
  validate(zhSections, 'zh');
  validate(enSections, 'en');

  const count = Math.min(zhSections.length, enSections.length);
  for (let index = 0; index < count; index++) {
    const zhOrdinal = ORDINAL.exec(zhSections[index]!.heading)?.[1] ?? null;
    const enOrdinal = ORDINAL.exec(enSections[index]!.heading)?.[1] ?? null;
    if (zhOrdinal !== enOrdinal) {
      issues.push(issue(`section-${index + 1}`, 'en', `章节序号不一致：zh=${zhOrdinal ?? '无'}，en=${enOrdinal ?? '无'}`));
    }
    if (zhSections[index]!.body.length !== enSections[index]!.body.length) {
      issues.push(issue(`section-${index + 1}`, 'en', `正文段落数量不一致：zh=${zhSections[index]!.body.length}，en=${enSections[index]!.body.length}`));
    }
  }
  return issues;
}

export function parseModelIssues(text: string): AuditIssue[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^```(?:json)?\s*/, '').replace(/\s*```\s*$/, ''));
  } catch {
    throw new AuditUnavailable('模型输出不是合法 JSON');
  }
  if (!parsed || typeof parsed !== 'object' || !('issues' in parsed) || !Array.isArray(parsed.issues)) {
    throw new AuditUnavailable('模型输出缺少 issues 数组');
  }
  return parsed.issues.map((value, index) => {
    if (!value || typeof value !== 'object') throw new AuditUnavailable(`模型 issues[${index}] 不是对象`);
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.id !== 'string' || (candidate.side !== 'zh' && candidate.side !== 'en') || typeof candidate.reason !== 'string') {
      throw new AuditUnavailable(`模型 issues[${index}] 不符合 id/side/reason 契约`);
    }
    return { id: candidate.id, side: candidate.side, reason: candidate.reason };
  });
}

function localStamp(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function reportPath(mode: AuditMode, stamp: string): string {
  return `docs/i18n-audit-${stamp}${mode === 'model' ? '-model' : ''}.md`;
}

function writeReport(mode: AuditMode, stamp: string, lines: string[]): string {
  const outPath = reportPath(mode, stamp);
  writeFileSync(outPath, lines.join('\n'));
  return outPath;
}

function sectionLines(index: number, zh: GuideSection, en: GuideSection, issues: AuditIssue[]): string[] {
  const lines = [
    `## 第 ${index + 1} 段：${zh.heading} · ${en.heading}`,
    `- zh: ${head(zh).slice(0, 180)}`,
    `- en: ${head(en).slice(0, 180)}`,
  ];
  if (issues.length === 0) lines.push('- 诊断: 未发现问题');
  else issues.forEach((entry) => lines.push(`- ${entry.side} issue: ${entry.reason}`));
  lines.push('');
  return lines;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('用法：npm run i18n:audit [-- --model]\n默认只做离线结构检查；--model 显式启用真实模型审计，并要求 NEXUS_AI_SERVICE_URL。');
    return;
  }
  if (args.some((arg) => arg !== '--model')) {
    console.error(`未知参数：${args.filter((arg) => arg !== '--model').join(' ')}`);
    process.exitCode = 2;
    return;
  }

  const mode: AuditMode = args.includes('--model') ? 'model' : 'offline';
  const stamp = localStamp(new Date());
  const zh = GUIDE_COPY.zh.sections as GuideSection[];
  const en = GUIDE_COPY.en.sections as GuideSection[];
  const structural = auditStructure(zh, en);
  const scope = `检查范围：${zh.length} 对章节；结构检查覆盖标题与全部正文，显式模型检查也覆盖标题与全部正文。`;

  if (mode === 'offline') {
    const lines = [
      `# 中英文合规审计报告（${stamp}）`,
      '',
      '模式：离线结构检查（未调用模型）',
      `状态：${structural.length === 0 ? '通过' : '失败'}`,
      scope,
      '边界：离线检查不证明语义忠实、自然度或错别字；需要模型语义审计时显式运行 i18n:audit:model。',
      `结构差异：${structural.length} 项`,
      '',
      ...structural.map((entry) => `- ${entry.id} / ${entry.side}: ${entry.reason}`),
    ];
    const outPath = writeReport(mode, stamp, lines);
    console.log(`离线结构检查：${structural.length} 项差异 · 报告 ${outPath}`);
    process.exitCode = structural.length === 0 ? 0 : 1;
    return;
  }

  if (!process.env.NEXUS_AI_SERVICE_URL?.trim()) {
    const lines = [
      `# 中英文合规审计报告（${stamp}）`,
      '',
      '模式：模型语义审计（显式启用）',
      '状态：不可用（未形成完整审计）',
      scope,
      '模型审计：未运行',
      '原因：未显式配置 NEXUS_AI_SERVICE_URL；开发模式默认地址不视为授权调用。',
      '翻译差异：未统计',
    ];
    const outPath = writeReport(mode, stamp, lines);
    console.error(`模型审计不可用：请显式配置 NEXUS_AI_SERVICE_URL · 报告 ${outPath}`);
    process.exitCode = 2;
    return;
  }

  if (structural.length > 0) {
    const lines = [
      `# 中英文合规审计报告（${stamp}）`,
      '',
      '模式：模型语义审计（显式启用）',
      '状态：失败（结构检查未通过，未调用模型）',
      scope,
      `结构差异：${structural.length} 项`,
      '',
      ...structural.map((entry) => `- ${entry.id} / ${entry.side}: ${entry.reason}`),
    ];
    const outPath = writeReport(mode, stamp, lines);
    console.error(`结构检查未通过：${structural.length} 项差异 · 报告 ${outPath}`);
    process.exitCode = 1;
    return;
  }

  const { chatWithCharacter } = await import('../apps/web/src/server/ai/client');
  const ask = async (text: string): Promise<AuditIssue[]> => {
    const result = await chatWithCharacter({
      requestId: `i18n-audit-${randomUUID()}`,
      system: SYSTEM,
      user: text,
      modelClass: 'balanced',
    });
    if (!result.ok) throw new AuditUnavailable(`AI 调用未成功：${result.error.message}`);
    if (result.response.capability !== 'real') {
      throw new AuditUnavailable(`模型响应 capability=${result.response.capability}，不能作为真实模型审计证据`);
    }
    return parseModelIssues(result.response.text);
  };

  const lines: string[] = [];
  let issuesTotal = 0;
  let completedChecks = 0;
  try {
    for (let index = 0; index < zh.length; index++) {
      const text = `zh 第 ${index + 1} 段\n${renderAuditSection(zh[index]!)}\n\nen 第 ${index + 1} 段\n${renderAuditSection(en[index]!)}\n请检查这一对：zh 语义内容是否全部在 en 翻译中出现；en 是否忠实、无中文字符、无繁体、无翻译腔。列出差异。`;
      const issues = await ask(text);
      issuesTotal += issues.length;
      completedChecks++;
      lines.push(...sectionLines(index, zh[index]!, en[index]!, issues));
      console.log(`第 ${index + 1} 段（zh→en）：${issues.length} 项差异`);
    }
    for (let index = 0; index < zh.length; index++) {
      const text = `en 第 ${index + 1} 段\n${renderAuditSection(en[index]!)}\n\nzh 第 ${index + 1} 段\n${renderAuditSection(zh[index]!)}\n检查 en 译文是否遗漏或误译 zh 原文的关键名、数字与主要内容。列出差异。`;
      const issues = await ask(text);
      issuesTotal += issues.length;
      completedChecks++;
      lines.push(`## 第 ${index + 1} 段（en→zh）：${en[index]!.heading}`, '');
      if (issues.length === 0) lines.push('- 诊断: 未发现问题');
      else issues.forEach((entry) => lines.push(`- ${entry.side} issue: ${entry.reason}`));
      lines.push('');
    }
  } catch (error) {
    if (!(error instanceof AuditUnavailable)) throw error;
    const unavailable = [
      `# 中英文合规审计报告（${stamp}）`,
      '',
      '模式：模型语义审计（显式启用）',
      '状态：不可用（未形成完整审计）',
      scope,
      `已完成模型检查：${completedChecks}/${zh.length * 2}`,
      `基础设施错误：${error.message}`,
      '翻译差异：未统计（此错误不是翻译差异）',
      '',
      ...lines,
    ];
    const outPath = writeReport(mode, stamp, unavailable);
    console.error(`模型审计中断：${error.message} · 报告 ${outPath}`);
    process.exitCode = 2;
    return;
  }

  const report = [
    `# 中英文合规审计报告（${stamp}）`,
    '',
    '模式：模型语义审计（显式启用，真实 capability）',
    `状态：${issuesTotal === 0 ? '通过' : '发现差异'}`,
    scope,
    `总差异：${issuesTotal} 项`,
    '',
    ...lines,
  ];
  const outPath = writeReport(mode, stamp, report);
  console.log(`报告已写 ${outPath} · 总差异：${issuesTotal} 项`);
  process.exitCode = issuesTotal === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error('i18n-audit 致命错误：', error);
    process.exitCode = 1;
  });
}
