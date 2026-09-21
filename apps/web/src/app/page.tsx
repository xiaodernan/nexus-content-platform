import { getAiCapabilities } from '@/lib/env';

const MODALITIES = [
  { key: 'text', label: '文本 / 设计生成' },
  { key: 'image', label: '图像生成' },
  { key: 'video', label: '视频生成' },
] as const;

export default function HomePage() {
  const caps = getAiCapabilities();

  return (
    <main className="mx-auto flex min-h-screen max-w-[820px] flex-col gap-[var(--nexus-space-8)] px-[var(--nexus-space-6)] py-[var(--nexus-space-12)]">
      <header className="flex items-baseline justify-between gap-[var(--nexus-space-4)]">
        <div>
          <h1 className="text-[var(--nexus-font-size-28)] font-semibold tracking-tight">NEXUS</h1>
          <p className="text-[var(--nexus-font-size-14)] text-fg-2">Describe it. Design it. Generate it. Build it. Enter it.</p>
        </div>
        <span
          className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-[var(--nexus-space-3)] py-[var(--nexus-space-1)] font-mono text-[var(--nexus-font-size-12)] text-fg-2"
          data-demo-mode={caps.live ? 'off' : 'on'}
        >
          {caps.live ? 'LIVE PROVIDER' : 'DEMO MODE'}
        </span>
      </header>

      <section className="border-t border-[var(--nexus-color-border-subtle)] pt-[var(--nexus-space-6)]">
        <h2 className="mb-[var(--nexus-space-3)] text-[var(--nexus-font-size-16)] font-medium">Provider 就绪状态</h2>
        <p className="mb-[var(--nexus-space-4)] text-[var(--nexus-font-size-13)] text-fg-3">
          读取自进程环境变量。未配置真实 key 时，生成链路走标注过的确定性 Mock，而不是伪装成功能可用（§159-160）。
        </p>
        <ul className="grid gap-[var(--nexus-space-2)]">
          {MODALITIES.map((m) => (
            <li key={m.key} className="flex items-center justify-between rounded-[var(--nexus-radius-sm)] bg-bg-1 px-[var(--nexus-space-4)] py-[var(--nexus-space-3)]">
              <span className="text-[var(--nexus-font-size-14)]">{m.label}</span>
              <span className="font-mono text-[var(--nexus-font-size-12)] uppercase text-fg-2">{caps[m.key]}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
