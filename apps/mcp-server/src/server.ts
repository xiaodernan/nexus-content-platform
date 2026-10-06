import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callV1, V1TransportError, type NexusApiConfig } from './api.js';

/**
 * NEXUS 的 MCP 工具面。四个工具与 v1 的四条端点一一对应，一行逻辑都不多：
 * 读三条（清单 / 详情 / 设计文档）+ 写一条（设计补丁）。
 *
 * 工具描述里写的是调用方**必须先知道**的限度（§159：写在它看得见的地方）：
 * - 拉整份文档之前先看规模（§146 的顶档是几万节点，一份可能几 MB）；
 * - 删除类 op 会被 `approval_required` 拒——公网这一侧没有人能批准；
 * - op 打不到存在的东西会被 `ops_skipped` 整体拒绝（写一半比不写更难查）。
 */
export function createNexusMcpServer(config: NexusApiConfig): McpServer {
  const server = new McpServer({ name: 'nexus', version: '0.1.0' });

  async function result(method: 'GET' | 'PATCH', path: string, body?: unknown) {
    try {
      const { status, body: payload } = await callV1(config, method, path, body);
      if (status >= 400) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `平台返回 ${status}：${JSON.stringify(payload)}` }],
        };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
    } catch (error: unknown) {
      if (error instanceof V1TransportError) {
        return { isError: true, content: [{ type: 'text' as const, text: error.message }] };
      }
      throw error;
    }
  }

  server.registerTool(
    'nexus_list_projects',
    {
      title: '列出 NEXUS 项目',
      description:
        '列出这枚 API 凭据所属人名下的 NEXUS 项目（含每份文档的页数/节点数规模）。' +
        '先用它决定要不要拉整份设计文档——规模大的文档拉整份可能有几 MB。',
      inputSchema: {},
    },
    async () => result('GET', '/api/v1/projects'),
  );

  server.registerTool(
    'nexus_get_project',
    {
      title: '查看 NEXUS 项目详情',
      description: '单个项目的详情与文档规模。404 意味着项目不在这一枚凭据所属的人名下或已删除——两种情况给同一个答案。',
      inputSchema: { projectId: z.string().min(1).describe('项目 id（来自 nexus_list_projects）') },
    },
    async ({ projectId }) => result('GET', `/api/v1/projects/${encodeURIComponent(projectId)}`),
  );

  server.registerTool(
    'nexus_get_design',
    {
      title: '读取 NEXUS 设计文档',
      description:
        '读一份项目的完整设计文档（设计模型是唯一真值；渲染结果只是投影，所以要读的就是这一份 JSON）。' +
        '没有分页与字段裁剪：顶档文档整份回来，先用 nexus_get_project 看规模。',
      inputSchema: { projectId: z.string().min(1).describe('项目 id（来自 nexus_list_projects）') },
    },
    async ({ projectId }) => result('GET', `/api/v1/projects/${encodeURIComponent(projectId)}/design`),
  );

  server.registerTool(
    'nexus_patch_design',
    {
      title: '给 NEXUS 设计文档打补丁',
      description:
        '向一份设计文档提交可撤销的补丁（一次调用 = Studio 历史里的一条记录）。' +
        'ops 是补丁操作数组：set / merge / insert / remove / reparent / reorder / setToken / addToken / removeToken / ' +
        'addComponent / removeComponent / restoreComponent / addAsset / removeAsset / restoreAsset / addPage / removePage，' +
        '每次 1-200 条。注意：删除类 op（removePage / removeComponent / removeAsset）会被 approval_required 拒——' +
        '公网这一侧没有人能批准破坏性操作；引用了不存在节点的 op 会被 ops_skipped 整体拒绝，不会写一半。',
      inputSchema: {
        projectId: z.string().min(1).describe('项目 id'),
        summary: z.string().min(1).max(200).describe('这次补丁的一句话摘要（进项目历史）'),
        ops: z
          .array(z.record(z.string(), z.unknown()))
          .min(1)
          .max(200)
          .describe('补丁操作数组，每条形如 {"op":"set","nodeId":"…","path":"…","value":…}'),
      },
    },
    async ({ projectId, summary, ops }) =>
      result('PATCH', `/api/v1/projects/${encodeURIComponent(projectId)}/design`, { summary, ops }),
  );

  return server;
}
