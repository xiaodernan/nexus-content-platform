import { readFileSync } from 'node:fs';

/**
 * 读一个文本文件，并把行尾归一成 LF。
 *
 * 为什么需要它（§GATE-3，2026-11-23）：
 *
 * 本仓库有一百多道「把文件内容哈希成一枚钉」的判据。哈希是对**内容**的承诺，
 * 但读文件读回来的是**工作区字节**——而工作区字节带行尾。
 *
 * `.gitattributes` 写的是 `* text=auto eol=lf`，所以正常检出（CI 的 Linux、
 * 以及本机新克隆的工作树）拿到的都是 LF。但 Windows 上任何一个工具
 * （编辑器、脚本、合并）把某个 .tsx 写成 CRLF 之后，git 会认为它与 blob 等价
 * （`status` 干净、diff 干净），而**门算出来的哈希已经变了**。
 *
 * 实测过一次：`apps/web/src/app/admin/page.tsx` 在这台机器上是 155 行 CRLF，
 * 于是 admin-hub 那道门本地红、CI 绿——一条**只在某台机器上红**的判据。
 * 那不是门在发现问题，是门在量检出方式。
 *
 * 所以：凡是把文件内容喂进哈希的门，一律走这个读法。
 * `apps/web/test/gate-hygiene.test.ts` 里有一条臂在守这件事。
 */
export function readStable(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}
