import {
  DesignPatchSchema,
  PatchOpSchema,
  AiRequestSchema,
  HealthResponseSchema,
} from '../../packages/schemas/src/index.ts';
import { CONTRACT_EXPORTS, renderContract } from '../../packages/schemas/src/contract.ts';
import { EvalRecorder } from '../lib/recorder.ts';
import type { EvalSuite } from '../types.ts';

/**
 * §6 架构纪律（边界纪律 #6）：web ↔ ai-service 的**所有跨端报文**只能走 `packages/schemas`
 * 的 zod 定义；`contract.ts` 的 `CONTRACT_EXPORTS` 是这份契约的机器可读注册表，
 * `scripts/export-ai-contract.mts` 把它导成 JSON Schema 交给 Python 侧运行期校验。
 *
 * 这条 eval 钉的是"契约本身自洽、且能拦住坏报文"——单测不会从"跨端契约"这个视角看：
 *   1. `CONTRACT_EXPORTS` 非空且每项齐全（file + zod schema + io 方向），覆盖 design-patch/
 *      ai-request/health 等核心报文；
 *   2. 每项都能导出成**可解析的 JSON Schema**（Python 侧真能拿去校验，不是纸面定义）；
 *   3. 代表性报文（DesignPatch / PatchOp / AiRequest / HealthResponse）**合法样本能过、
 *      畸形样本（缺字段 / 错枚举 / 类型错）一律被拒**——跨端边界的守门员在岗；
 *   4. DesignPatch 序列化往返稳定（`parse → stringify → parse` 逐字段相同，§16 要能重放）。
 * 不碰真 provider（§159）：这里验的是形状，不是像素。
 */
export const schemasContractSuite: EvalSuite = {
  name: 'schemas-contract',
  dimension: '架构纪律 #6 / 跨端契约自洽（packages/schemas）',
  needsDatabase: false,

  run() {
    const rec = new EvalRecorder();
    console.log('\n== 跨端契约自洽（packages/schemas · 边界纪律 #6）· 注册表完整 + 导出 JSON Schema + 坏报文被拒 ==');

    // 1. 注册表完整性
    {
      const integrity = CONTRACT_EXPORTS.length > 0 &&
        CONTRACT_EXPORTS.every(
          (e) => typeof e.file === 'string' && e.file.length > 0 && !!e.schema && (e.io === 'input' || e.io === 'output'),
        );
      rec.structural('CONTRACT_EXPORTS：非空且每项齐全（file+schema+io）', integrity, `${CONTRACT_EXPORTS.length} entries`);
      const covers = ['design-patch.schema.json', 'ai-request.schema.json', 'health.schema.json'].every((f) =>
        CONTRACT_EXPORTS.some((e) => e.file === f),
      );
      rec.structural('CONTRACT_EXPORTS：覆盖 design-patch/ai-request/health 核心报文', covers, covers ? 'covered' : 'MISSING');
    }

    // 2. 每项都能导出成可解析的 JSON Schema（Python 侧能拿去校验）
    {
      const everyExports = CONTRACT_EXPORTS.every((e) => {
        try {
          const j = JSON.parse(renderContract(e.file));
          return !!j && typeof j === 'object' && (j.$schema !== undefined || j.type !== undefined || j.properties !== undefined || j.$defs !== undefined);
        } catch {
          return false;
        }
      });
      rec.structural('CONTRACT_EXPORTS：每项都能导出可解析的 JSON Schema', everyExports, everyExports ? 'all-export' : 'EXPORT-FAIL');
    }

    // 3. DesignPatch：合法过、畸形拒
    {
      const ok = DesignPatchSchema.safeParse({ ops: [{ op: 'set', nodeId: 'n1', path: '/a', value: 1 }] });
      rec.structural('DesignPatch：合法补丁通过', ok.success === true, ok.success ? 'ok' : JSON.stringify(ok.error?.issues ?? ok));
      const badType = DesignPatchSchema.safeParse({ ops: 'not-an-array' });
      rec.structural('DesignPatch：ops 非数组被拒', badType.success === false, badType.success ? 'UNEXPECTED-PASS' : 'rejected');
      const badOp = DesignPatchSchema.safeParse({ ops: [{ op: 'set', nodeId: 'n1' }] });
      rec.structural('DesignPatch：set 缺 path 被拒', badOp.success === false, badOp.success ? 'UNEXPECTED-PASS' : 'rejected');
    }

    // 4. PatchOp：判别联合
    {
      const ok = PatchOpSchema.safeParse({ op: 'remove', nodeId: 'n1' });
      rec.structural('PatchOp：合法 remove 通过', ok.success === true, ok.success ? 'ok' : 'FAIL');
      const unknown = PatchOpSchema.safeParse({ op: 'frobnicate', nodeId: 'n1' });
      rec.structural('PatchOp：未知 op 被拒', unknown.success === false, unknown.success ? 'UNEXPECTED-PASS' : 'rejected');
      const missingNode = PatchOpSchema.safeParse({ op: 'set', path: '/a', value: 1 });
      rec.structural('PatchOp：set 缺 nodeId 被拒', missingNode.success === false, missingNode.success ? 'UNEXPECTED-PASS' : 'rejected');
    }

    // 5. AiRequest：合法过、畸形拒
    {
      const ok = AiRequestSchema.safeParse({ requestId: 'r1', prompt: 'hi', context: { projectId: 'p1' } });
      rec.structural('AiRequest：合法请求通过', ok.success === true, ok.success ? 'ok' : JSON.stringify(ok.error?.issues ?? ok));
      const noId = AiRequestSchema.safeParse({ prompt: 'hi', context: { projectId: 'p1' } });
      rec.structural('AiRequest：缺 requestId 被拒', noId.success === false, noId.success ? 'UNEXPECTED-PASS' : 'rejected');
      const emptyPrompt = AiRequestSchema.safeParse({ requestId: 'r1', prompt: '', context: { projectId: 'p1' } });
      rec.structural('AiRequest：空 prompt 被拒', emptyPrompt.success === false, emptyPrompt.success ? 'UNEXPECTED-PASS' : 'rejected');
      const badIntent = AiRequestSchema.safeParse({ requestId: 'r1', prompt: 'hi', intent: 'not-real', context: { projectId: 'p1' } });
      rec.structural('AiRequest：非法 intent 被拒', badIntent.success === false, badIntent.success ? 'UNEXPECTED-PASS' : 'rejected');
    }

    // 6. HealthResponse：合法过、畸形拒
    {
      const ok = HealthResponseSchema.safeParse({ service: 'web', version: '1.0', capability: 'demo' });
      rec.structural('HealthResponse：合法响应通过', ok.success === true, ok.success ? 'ok' : 'FAIL');
      const badCap = HealthResponseSchema.safeParse({ service: 'web', version: '1.0', capability: 'maybe' });
      rec.structural('HealthResponse：非法 capability 枚举被拒', badCap.success === false, badCap.success ? 'UNEXPECTED-PASS' : 'rejected');
    }

    // 7. DesignPatch 序列化往返稳定（parse → stringify → parse 逐字段相同，§16 要能重放）
    {
      const sample = { ops: [{ op: 'set', nodeId: 'n1', path: '/a', value: 1 }, { op: 'remove', nodeId: 'n2' }] };
      const a = DesignPatchSchema.parse(sample);
      const b = DesignPatchSchema.parse(JSON.parse(JSON.stringify(a)));
      rec.structural('DesignPatch：序列化往返稳定（parse→stringify→parse 一致）', deepEqual(a, b), deepEqual(a, b) ? 'stable' : 'DRIFT');
    }

    // 8. 套件非空壳
    rec.structural('套件总览：结构性 check >= 10（非空壳）', rec.checks.length >= 10, rec.checks.length);

    rec.skip('真 provider 像素（§38/§39/§40 要真 key，§159 不许假造）');
    rec.skip('具体枚举对齐（world/game/video 的枚举已各有 *-contract 单测钉死，这里只验契约层门禁）');

    return { checks: rec.checks, notMeasured: rec.notMeasured };
  },
};

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
