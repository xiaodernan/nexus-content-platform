import { z } from 'zod';
import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { PROJECT_KINDS, createProject, listProjects } from '@/server/domain/projects';
import { badRequest, failure, readJson } from '@/server/http';

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
