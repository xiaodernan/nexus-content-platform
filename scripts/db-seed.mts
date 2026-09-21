/**
 * 写入 Agent 注册表（§24 / docs/AGENTS.md）。
 * AI Service 启动时读这张表来决定每个 Agent 的能力、工具与模型档位；
 * 空表意味着没有任何 Agent 可跑，所以这一步不是可选项。
 * 用法：npm run db:seed
 */
import postgres from 'postgres';

const url = process.env.NEXUS_DATABASE_URL ?? 'postgres://nexus:nexus_dev_only@localhost:55433/nexus';

interface AgentSeed {
  key: string;
  name: string;
  capabilities: string[];
  tools: string[];
  modelClass: string;
  maxSteps: number;
  output: string | null;
}

const AGENTS: AgentSeed[] = [
  { key: 'product', name: 'Product Agent', capabilities: ['project.read', 'plan.write'], tools: ['search_design', 'read_file'], modelClass: 'reasoning', maxSteps: 8, output: 'agent_plan' },
  { key: 'design', name: 'Design Agent', capabilities: ['design.read', 'design.patch', 'token.write', 'asset.generate'], tools: ['search_design', 'modify_design', 'create_component', 'generate_image'], modelClass: 'reasoning', maxSteps: 12, output: 'design_patch' },
  { key: 'coding', name: 'Coding Agent', capabilities: ['code.read', 'code.write', 'command.run.sandboxed'], tools: ['read_file', 'write_file', 'search_code', 'run_test', 'open_browser', 'screenshot'], modelClass: 'reasoning', maxSteps: 20, output: 'file_diff' },
  { key: 'research', name: 'Research Agent', capabilities: ['web.read'], tools: ['search_web', 'read_file'], modelClass: 'fast', maxSteps: 6, output: 'research_notes' },
  { key: 'image', name: 'Image Agent', capabilities: ['asset.generate', 'asset.read'], tools: ['generate_image', 'search_design'], modelClass: 'vision', maxSteps: 6, output: 'asset' },
  { key: 'video', name: 'Video Agent', capabilities: ['asset.generate', 'storyboard.write'], tools: ['generate_video', 'generate_image'], modelClass: 'vision', maxSteps: 10, output: 'asset' },
  { key: '3d', name: '3D Agent', capabilities: ['asset.generate', 'scene.write'], tools: ['generate_image', 'write_file'], modelClass: 'reasoning', maxSteps: 10, output: 'scene' },
  { key: 'game', name: 'Game Agent', capabilities: ['game.write', 'design.patch', 'code.write'], tools: ['modify_design', 'write_file', 'run_test'], modelClass: 'reasoning', maxSteps: 24, output: 'game_spec' },
  { key: 'qa', name: 'QA Agent', capabilities: ['browser.read', 'test.run'], tools: ['open_browser', 'screenshot', 'run_test', 'click', 'type'], modelClass: 'fast', maxSteps: 12, output: 'qa_report' },
  { key: 'security', name: 'Security Agent', capabilities: ['code.read', 'audit.write'], tools: ['search_code', 'read_file'], modelClass: 'reasoning', maxSteps: 8, output: 'audit_report' },
  { key: 'seo', name: 'SEO Agent', capabilities: ['code.read', 'content.write'], tools: ['read_file', 'write_file', 'search_web'], modelClass: 'fast', maxSteps: 6, output: 'content_patch' },
  { key: 'content', name: 'Content Agent', capabilities: ['content.write', 'lore.write'], tools: ['write_file', 'retrieve_rag'], modelClass: 'fast', maxSteps: 8, output: 'content_patch' },
  { key: 'growth', name: 'Growth Agent', capabilities: ['analytics.read'], tools: ['query_database', 'search_web'], modelClass: 'fast', maxSteps: 6, output: 'growth_notes' },
];

const sql = postgres(url, { max: 1 });
try {
  await sql`set client_min_messages = warning`;
  for (const agent of AGENTS) {
    await sql`
      insert into agents (key, name, capabilities, tools, model_class, max_steps, output)
      values (${agent.key}, ${agent.name}, ${agent.capabilities}, ${agent.tools}, ${agent.modelClass}, ${agent.maxSteps}, ${agent.output})
      on conflict (key) do update set
        name = excluded.name,
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
