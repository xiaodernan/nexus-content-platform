import type {
  AssetRef,
  ComponentDefinition,
  DesignDocument,
  DesignNode,
  Page,
  Token,
} from "./types";
import { clone } from "./nodes";

/**
 * `.nexus/` 项目格式（§102）。设计项目必须可序列化、可导出、可再导入（§103/§144）。
 * 每个文件独立可读，方便用户用编辑器直接改，也方便 Git 托管用户项目。
 */
export const PROJECT_FORMAT_VERSION = 1;

export interface ProjectManifest {
  format: "nexus-project";
  version: number;
  id: string;
  name: string;
  projectType?: DesignDocument["metadata"]["projectType"];
  activePageId: string;
  pages: { id: string; name: string; file: string; route?: string }[];
  codeEntries: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SerializedProject {
  manifest: ProjectManifest;
  design: { nodes: Record<string, DesignNode[]> };
  tokens: { tokens: Token[]; activeMode?: string | null; modes: string[] };
  components: { components: ComponentDefinition[] };
  assets: { assets: AssetRef[] };
  visualDna?: DesignDocument["visualDna"];
  brandKit?: DesignDocument["brandKit"];
  metadata: DesignDocument["metadata"] & { author?: string };
}

/** 生成 `.nexus/` 下的文件表：path → 内容 */
export function toProjectFiles(
  document: DesignDocument,
): Record<string, string> {
  const manifest: ProjectManifest = {
    format: "nexus-project",
    version: PROJECT_FORMAT_VERSION,
    id: document.id,
    name: document.name,
    projectType: document.metadata.projectType,
    activePageId: document.activePageId,
    pages: document.pages.map((page) => ({
      id: page.id,
      name: page.name,
      file: `design/pages/${safeName(page.name)}-${page.id}.json`,
      route: page.meta?.route,
    })),
    codeEntries: [],
    createdAt: document.metadata.createdAt,
    updatedAt: document.metadata.updatedAt,
  };

  const files: Record<string, string> = {};
  files[".nexus/project.json"] = stringify(manifest);

  for (const page of document.pages) {
    const entry = manifest.pages.find((p) => p.id === page.id)!;
    files[`.nexus/${entry.file}`] = stringify({
      id: page.id,
      name: page.name,
      width: page.width,
      height: page.height,
      backgroundColor: page.backgroundColor,
      rootId: page.rootId,
      nodes: Object.values(page.nodes),
    });
  }

  files[".nexus/tokens.json"] = stringify({
    tokens: document.tokens,
    activeMode: document.activeMode ?? null,
    modes: document.metadata.modes,
  });
  files[".nexus/components.json"] = stringify({
    components: document.components,
  });
  files[".nexus/assets/manifest.json"] = stringify({ assets: document.assets });
  if (document.visualDna)
    files[".nexus/visual-dna.json"] = stringify(document.visualDna);
  if (document.brandKit)
    files[".nexus/brand-kit.json"] = stringify(document.brandKit);
  files[".nexus/metadata.json"] = stringify(document.metadata);
  return files;
}

/** 从 `.nexus/` 文件表还原（缺失文件即报错，不静默补默认值，§159） */
export function fromProjectFiles(
  files: Record<string, string>,
): DesignDocument {
  const manifestRaw = files[".nexus/project.json"];
  if (!manifestRaw) throw new Error("missing .nexus/project.json");
  const manifest = JSON.parse(manifestRaw) as ProjectManifest;
  if (manifest.format !== "nexus-project")
    throw new Error("not a nexus project");
  if (manifest.version > PROJECT_FORMAT_VERSION)
    throw new Error(`unsupported project version: ${manifest.version}`);

  const pages: Page[] = manifest.pages.map((entry) => {
    const raw = files[`.nexus/${entry.file}`];
    if (!raw) throw new Error(`missing page file: .nexus/${entry.file}`);
    const parsed = JSON.parse(raw) as {
      id: string;
      name: string;
      width: number;
      height: number;
      rootId: string;
      backgroundColor?: Page["backgroundColor"];
      nodes: DesignNode[];
    };
    const nodes: Record<string, DesignNode> = {};
    for (const node of parsed.nodes) nodes[node.id] = node;
    return {
      id: parsed.id,
      name: parsed.name,
      width: parsed.width,
      height: parsed.height,
      rootId: parsed.rootId,
      backgroundColor: parsed.backgroundColor,
      nodes,
      meta: { route: entry.route },
    };
  });

  const tokensFile = files[".nexus/tokens.json"];
  const tokens = tokensFile
    ? (JSON.parse(tokensFile) as {
        tokens: Token[];
        activeMode?: string | null;
        modes?: string[];
      })
    : { tokens: [], modes: [] };
  const componentsFile = files[".nexus/components.json"];
  const components = componentsFile
    ? (JSON.parse(componentsFile) as { components: ComponentDefinition[] })
        .components
    : [];
  const assetsFile = files[".nexus/assets/manifest.json"];
  const assets = assetsFile
    ? (JSON.parse(assetsFile) as { assets: AssetRef[] }).assets
    : [];
  const metadataRaw = files[".nexus/metadata.json"];
  const metadata = metadataRaw
    ? (JSON.parse(metadataRaw) as DesignDocument["metadata"])
    : {
        createdAt: manifest.createdAt,
        updatedAt: manifest.updatedAt,
        modes: ["light", "dark"],
      };

  return {
    id: manifest.id,
    schemaVersion: 1,
    name: manifest.name,
    pages,
    activePageId: manifest.activePageId,
    components,
    tokens: tokens.tokens,
    activeMode: tokens.activeMode ?? null,
    assets,
    variables: [],
    visualDna: files[".nexus/visual-dna.json"]
      ? (JSON.parse(
          files[".nexus/visual-dna.json"]!,
        ) as DesignDocument["visualDna"])
      : undefined,
    brandKit: files[".nexus/brand-kit.json"]
      ? (JSON.parse(
          files[".nexus/brand-kit.json"]!,
        ) as DesignDocument["brandKit"])
      : undefined,
    metadata: {
      ...metadata,
      projectType: manifest.projectType,
      modes: metadata.modes?.length ? metadata.modes : ["light", "dark"],
    },
  };
}

export function serializeDocument(document: DesignDocument): string {
  return stringify(document);
}

export function deserializeDocument(text: string): DesignDocument {
  const parsed = JSON.parse(text) as DesignDocument;
  if (parsed.schemaVersion !== 1)
    throw new Error(
      `unsupported design schema version: ${(parsed as { schemaVersion?: number }).schemaVersion}`,
    );
  return clone(parsed);
}

export function serializePage(page: Page): SerializedPage {
  return {
    ...page,
    nodes: Object.values(page.nodes),
  } as unknown as SerializedPage;
}

export interface SerializedPage extends Omit<Page, "nodes"> {
  nodes: DesignNode[];
}

export function deserializePage(input: SerializedPage): Page {
  const nodes: Record<string, DesignNode> = {};
  for (const node of input.nodes) nodes[node.id] = node;
  return {
    id: input.id,
    name: input.name,
    width: input.width,
    height: input.height,
    rootId: input.rootId,
    backgroundColor: input.backgroundColor,
    nodes,
    meta: input.meta,
  };
}

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function safeName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "page"
  );
}
