#!/usr/bin/env node
/**
 * §STRESS-2 · Redis L2 补全缓存完整度压测（只读+可回收，绝不跑在生产池上）。
 *
 * 背景：总指令第十一节「模拟海量用户、高并发、大数据量去冲击系统」。
 * `ai-service` 的提供方响应在 nexus:llmc 命名空间下做 L2 精确回放；
 * 本脚本直接压测那条读路径（与 CachedLlm 同一套 SET/GET 形态）：
 *
 *   Phase 1 · SET 写入 2 000 个 nexus:llmc:stress:* 样本（TTL 30s，10 个 pipeline 批）
 *   Phase 2 · GET 串行 500 次（单 RTT 语义 + p50/p95/p99）
 *   Phase 3 · GET pipeline 20 000 次（100/批 pipeline 语义 + 吞吐量）
 *   Phase 4 · SCAN + UNLINK 清掉全部 stress 键，再次 SCAN 确认 0 残留
 *
 * 安全边界：
 * - 只写 `nexus:llmc:stress:*`；结束 UNLINK 全部；不使用 FLUSHALL / FLUSHDB；
 * - 不碰任何其他命名空间（sibling 数据在别的 DB，避免误删——开发容器是空的）；
 * - 输出 JSON，供 evidence 文档原文采集。
 */
import { createConnection } from 'node:net';

const NS = 'nexus:llmc:stress:';
const N_SET = 2000;
const N_SERIAL_GET = 500;
const N_PIPELINED_GET = 20000;
const PIPELINE = 100;
const BATCHES = N_PIPELINED_GET / PIPELINE;

const host = '127.0.0.1';
const port = 56379;

function encode(args) {
  let out = `*${args.length}\r\n`;
  for (const a of args) {
    const s = String(a);
    out += `$${Buffer.byteLength(s)}\r\n${s}\r\n`;
  }
  return out;
}

class Resp {
  constructor() { this.buf = Buffer.alloc(0); this.waiters = []; }
  feed(chunk) { this.buf = Buffer.concat([this.buf, chunk]); this.drain(); }
  drain() {
    while (this.waiters.length) {
      const parsed = this.tryParse(this.buf, 0, []);
      if (!parsed) return;
      const [value, end] = parsed;
      this.buf = this.buf.subarray(end);
      const resolve = this.waiters.shift();
      resolve(value);
    }
  }
  tryParse(buf, off, path) {
    if (off >= buf.length) return null;
    const kind = String.fromCharCode(buf[off]);
    if (kind === '+' || kind === '-' || kind === ':') {
      const nl = buf.indexOf('\r\n', off);
      if (nl === -1) return null;
      const line = buf.toString('utf8', off + 1, nl);
      return [kind === '-' ? new Error(line) : kind === ':' ? BigInt(line) : line, nl + 2];
    }
    if (kind === '$') {
      const nl = buf.indexOf('\r\n', off);
      if (nl === -1) return null;
      const len = Number(buf.toString('utf8', off + 1, nl));
      if (len === -1) return [null, nl + 2];
      const end = nl + 2 + len + 2;
      if (buf.length < end) return null;
      return [buf.toString('utf8', nl + 2, nl + 2 + len), end];
    }
    if (kind === '*') {
      const nl = buf.indexOf('\r\n', off);
      if (nl === -1) return null;
      const n = Number(buf.toString('utf8', off + 1, nl));
      if (n === -1) return [null, nl + 2];
      const arr = [];
      let cursor = nl + 2;
      for (let i = 0; i < n; i += 1) {
        const item = this.tryParse(buf, cursor, path);
        if (!item) return null;
        arr.push(item[0]);
        cursor = item[1];
      }
      return [arr, cursor];
    }
    return null;
  }
  send(...args) {
    return new Promise((resolve) => {
      this.waiters.push(resolve);
      this.socket.write(encode(args));
    });
  }
  pipeline(batch) {
    // 每条 pipeline 指令都消耗一个 waiter（FIFO 对齐）；全部读到的时候一次性返回。
    // 如果 parser 少读/多读一条，后续请求会错位，所以这里必须严丝合缝。
    return new Promise((resolve) => {
      const results = new Array(batch.length);
      let done = 0;
      for (let i = 0; i < batch.length; i += 1) {
        this.waiters.push((v) => {
          results[i] = v;
          done += 1;
          if (done === batch.length) resolve(results);
        });
      }
      this.socket.write(batch.map(encode).join(''));
    });
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.socket = createConnection({ host, port }, () => resolve());
      this.socket.on('data', (chunk) => this.feed(chunk));
      this.socket.on('error', reject);
    });
  }
  close() { this.socket.destroy(); }
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

async function main() {
  const r = new Resp();
  await r.connect();

  // Phase 1 · SET
  let t0 = performance.now();
  for (let b = 0; b < N_SET / 100; b += 1) {
    const batch = [];
    for (let i = b * 100; i < (b + 1) * 100; i += 1) {
      batch.push(['SET', `${NS}${i}`, 'x'.repeat(1024), 'EX', '30']);
    }
    await r.pipeline(batch);
  }
  const setMs = Math.round(performance.now() - t0);

  // Phase 2 · serial GET ×500, RTT 语义
  const serial = [];
  for (let i = 0; i < N_SERIAL_GET; i += 1) {
    t0 = performance.now();
    await r.send('GET', `${NS}${i % N_SET}`);
    serial.push(performance.now() - t0);
  }
  serial.sort((a, b) => a - b);

  // Phase 3 · pipelined GET 20 000 / 批 100
  t0 = performance.now();
  for (let b = 0; b < BATCHES; b += 1) {
    const batch = [];
    for (let i = 0; i < PIPELINE; i += 1) {
      batch.push(['GET', `${NS}${(b * PIPELINE + i) % N_SET}`]);
    }
    await r.pipeline(batch);
  }
  const getMs = Math.round(performance.now() - t0);

  // Phase 4 · cleanup
  const keys = [];
  let cursor = '0';
  do {
    const [next, items] = await r.send('SCAN', cursor, 'MATCH', `${NS}*`, 'COUNT', '500');
    cursor = String(next);
    keys.push(...items.map(String));
  } while (cursor !== '0');
  if (keys.length) {
    for (let i = 0; i < keys.length; i += 200) {
      await r.send('UNLINK', ...keys.slice(i, i + 200));
    }
  }
  const leftoverIds = [];
  cursor = '0';
  do {
    const [next, items] = await r.send('SCAN', cursor, 'MATCH', `${NS}*`, 'COUNT', '500');
    cursor = String(next);
    leftoverIds.push(...items.map(String));
  } while (cursor !== '0');

  r.close();
  console.log(JSON.stringify({
    setMs,
    setKeys: N_SET,
    setOpsPerSec: Math.round(N_SET / (setMs / 1000)),
    serialGets: N_SERIAL_GET,
    serialP50ms: Number(pct(serial, 50).toFixed(3)),
    serialP95ms: Number(pct(serial, 95).toFixed(3)),
    serialP99ms: Number(pct(serial, 99).toFixed(3)),
    pipelinedOps: N_PIPELINED_GET,
    pipelinedMs: getMs,
    pipelinedOpsPerSec: Math.round(N_PIPELINED_GET / (getMs / 1000)),
    keysDeleted: keys.length,
    keysLeft: leftoverIds.length,
  }, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
