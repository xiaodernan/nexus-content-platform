/**
 * 写入 Agent 注册表（§24 / docs/AGENTS.md）。
 * 用法：npm run db:seed
 *
 * 谁读这张表（说白，因为这里曾经写着"AI Service 启动时读它"而并没有）：
 * · `apps/web/src/server/domain/agents.ts` 读 `responsibilities` 与 `capabilities`——
 *   前者随 AI 请求进提示词（§112 那句"每个 Agent 有自己的职责"），
 *   后者里 `design.patch` 是今天唯一被代码执行的作用域（§73：没有它就不许让补丁落地）。
 * · `tools` / `model_class` / `max_steps` / `output` 这四列**今天没有读取方**：
 *   平台还没有 tool-calling 运行时，Model Router 看的是请求里那一栏而不是名册。
 *   留着是因为 schema 里本来就有这几列，播种一次让它们在库里；
 *   但别把它们读成"这些权限已经生效了"。
 * · 空表 = 名册没播种 = 谁都不认识。这不是"没有 Agent 可跑"那么中性：
 *   解析会把每一个 @提及都判成"名册里没有"，所以这条路径要能被读出来（见 agents.ts 的 rosterEmpty）。
 */
import postgres from 'postgres';

const url = process.env.NEXUS_DATABASE_URL ?? 'postgres://nexus:nexus_dev_only@localhost:55433/nexus';

interface AgentSeed {
  key: string;
  name: string;
  /** §112 的职责，逐条发给 provider */
  responsibilities: string[];
  capabilities: string[];
  tools: string[];
  modelClass: string;
  maxSteps: number;
  output: string | null;
}

const AGENTS: AgentSeed[] = [
  { key: 'product', name: 'Product Agent', responsibilities: ['把一句话需求整理成目标 / 约束 / 任务 / 验收', '判断这一轮该交给哪个 Agent'], capabilities: ['project.read', 'plan.write'], tools: ['search_design', 'read_file'], modelClass: 'reasoning', maxSteps: 8, output: 'agent_plan' },
  // §20 的 Design Agent 职责链，逐条照原文列出来——它是唯一一条"改设计模型"在职责里的
  { key: 'design', name: 'Design Agent', responsibilities: ['理解设计请求并分析现有设计', '理解设计系统后再动手', '规划并修改设计模型', '必要时生成资产', '跑视觉校验并解释结果'], capabilities: ['design.read', 'design.patch', 'token.write', 'asset.generate'], tools: ['search_design', 'modify_design', 'create_component', 'generate_image'], modelClass: 'reasoning', maxSteps: 12, output: 'design_patch' },
  // §21 的 Coding Agent 职责链：它动的是文件与浏览器，不是画布
  { key: 'coding', name: 'Coding Agent', responsibilities: ['理解代码库', '规划改动并修改文件', '跑测试、开浏览器、看截图', '根据截图继续修'], capabilities: ['code.read', 'code.write', 'command.run.sandboxed'], tools: ['read_file', 'write_file', 'search_code', 'run_test', 'open_browser', 'screenshot'], modelClass: 'reasoning', maxSteps: 20, output: 'file_diff' },
  { key: 'research', name: 'Research Agent', responsibilities: ['检索资料与项目内语料', '每条结论带来源'], capabilities: ['web.read'], tools: ['search_web', 'read_file'], modelClass: 'fast', maxSteps: 6, output: 'research_notes' },
  { key: 'image', name: 'Image Agent', responsibilities: ['按参考图与提示生成图像资产', '保持角色一致性'], capabilities: ['asset.generate', 'asset.read'], tools: ['generate_image', 'search_design'], modelClass: 'vision', maxSteps: 6, output: 'asset' },
  { key: 'video', name: 'Video Agent', responsibilities: ['分镜 → 镜头 → 视频', '按镜头重生成与延长'], capabilities: ['asset.generate', 'storyboard.write'], tools: ['generate_video', 'generate_image'], modelClass: 'vision', maxSteps: 10, output: 'asset' },
  { key: '3d', name: '3D Agent', responsibilities: ['生成与维护 3D 资产、场景与动画'], capabilities: ['asset.generate', 'scene.write'], tools: ['generate_image', 'write_file'], modelClass: 'reasoning', maxSteps: 10, output: 'scene' },
  { key: 'game', name: 'Game Agent', responsibilities: ['设计玩法、关卡、数值与对话', '改动落在游戏模型与设计文档上'], capabilities: ['game.write', 'design.patch', 'code.write'], tools: ['modify_design', 'write_file', 'run_test'], modelClass: 'reasoning', maxSteps: 24, output: 'game_spec' },
  { key: 'qa', name: 'QA Agent', responsibilities: ['检查结果是否满足验收', '跑校验并指出问题', '只提问题，不改设计文档'], capabilities: ['browser.read', 'test.run'], tools: ['open_browser', 'screenshot', 'run_test', 'click', 'type'], modelClass: 'fast', maxSteps: 12, output: 'qa_report' },
  { key: 'security', name: 'Security Agent', responsibilities: ['检查越权、注入与高危动作', '只提问题，不改设计文档'], capabilities: ['code.read', 'audit.write'], tools: ['search_code', 'read_file'], modelClass: 'reasoning', maxSteps: 8, output: 'audit_report' },
  { key: 'seo', name: 'SEO Agent', responsibilities: ['检查标题 / 描述 / 结构化数据 / sitemap'], capabilities: ['code.read', 'content.write'], tools: ['read_file', 'write_file', 'search_web'], modelClass: 'fast', maxSteps: 6, output: 'content_patch' },
  { key: 'content', name: 'Content Agent', responsibilities: ['写与改文案', '回应批注里提出的内容问题'], capabilities: ['content.write', 'lore.write'], tools: ['write_file', 'retrieve_rag'], modelClass: 'fast', maxSteps: 8, output: 'content_patch' },
  { key: 'growth', name: 'Growth Agent', responsibilities: ['看数据提出增长与留存建议'], capabilities: ['analytics.read'], tools: ['query_database', 'search_web'], modelClass: 'fast', maxSteps: 6, output: 'growth_notes' },
];

const sql = postgres(url, { max: 1 });
try {
  await sql`set client_min_messages = warning`;
  for (const agent of AGENTS) {
    await sql`
      insert into agents (key, name, responsibilities, capabilities, tools, model_class, max_steps, output)
      values (${agent.key}, ${agent.name}, ${agent.responsibilities}, ${agent.capabilities}, ${agent.tools}, ${agent.modelClass}, ${agent.maxSteps}, ${agent.output})
      on conflict (key) do update set
        name = excluded.name,
        responsibilities = excluded.responsibilities,
        capabilities = excluded.capabilities,
        tools = excluded.tools,
        model_class = excluded.model_class,
        max_steps = excluded.max_steps,
        output = excluded.output
    `;
  }
  const rows = await sql`select key from agents order by key`;
  console.log(`agents upserted: ${rows.length}`);
} finally {
  await sql.end({ timeout: 1 });
}
