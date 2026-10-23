import { z } from 'zod';
import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { PROJECT_KINDS, createProject, listProjects } from '@/server/domain/projects';
import { csrfOk } from '@/server/security/csrf';
import { ipWriteGate } from '@/server/security/rateLimit';
import { badRequest, failure, jsonError, readJson } from '@/server/http';

const CreateProjectSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(PROJECT_KINDS as [string, ...string[]]).default('website'),
});

export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireUser();
    return NextResponse.json({ projects: await listProjects(user.id) });
  } catch (error) {
    return failure(error, 'GET /api/projects');
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  // §137 的 guest 自动签发：无会话客户端的 user.id 每请求都是新的，按身份限流对它空转。
  // 所以这道按 IP 的闸必须放在 requireUser() 之前——被挡住的请求一个 guest 都不该建。
  const gate = ipWriteGate('projects/create', req, 20, 3600000);
  if (gate.limited) return jsonError(429, 'rate_limited', { message: '建项目太频繁了，稍后再试', retryAfterMs: gate.retryAfterMs });
  const body = await readJson(req);
  const parsed = CreateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  try {
    const user = await requireUser();
    const document = await createProject(user.id, {
      name: parsed.data.name,
      kind: parsed.data.kind as (typeof PROJECT_KINDS)[number],
    });
    return NextResponse.json({ projectId: document.id, document }, { status: 201 });
  } catch (error) {
    return failure(error, 'POST /api/projects');
  }
}
