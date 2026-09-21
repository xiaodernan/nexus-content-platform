import type { DesignDocument } from '@nexus/design-model';

/** Local "publish" for the slice: download the canonical Design Model snapshot (ADR 0004). */
export function exportJson(doc: DesignDocument): void {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  triggerDownload(URL.createObjectURL(blob), `${slug(doc.name)}-snapshot.json`);
}

export function exportHtml(html: string, name: string): void {
  const blob = new Blob([html], { type: 'text/html' });
  triggerDownload(URL.createObjectURL(blob), `${slug(name)}.html`);
}

/** Capture the live canvas surface as a PNG (screenshot evidence, §30/§32). */
export function exportCanvasPng(canvas: HTMLCanvasElement, name: string): void {
  triggerDownload(canvas.toDataURL('image/png'), `${slug(name)}.png`);
}

function triggerDownload(href: string, filename: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function slug(s: string): string {
  return (s || 'nexus').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
