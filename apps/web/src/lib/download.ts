/**
 * 浏览器里落盘一份字节（Blob + 一次性 `<a download>`）。
 *
 * **回收对象 URL 要等浏览器把下载接走之后**：`ExportPanel` 与市场条目两处此前都写着
 * "同一 tick 里 `revokeObjectURL` 会让下载停在 0 字节"，并各自 `setTimeout(…, 60_000)`；
 * 可玩产物那一处是立即回收——三份实现、两种时机、两句互相矛盾的话。
 * 2026-10-21 先用真浏览器量了立即回收那一处（e2e 读落盘字节：`index.html` 里
 * `<!doctype html>` 与 CSP、zip 的前四字节 `PK\x03\x04` 与包内文件名，全过）：
 * Chrome 的下载在 click 的同一个 tick 里就被接走了，**这个疑似在 Chrome 上没有复现**。
 * 但"某处能过"不等于"每处都对"，所以只留一处实现，取更保守的那种时机。
 */
export function saveBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
