import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openRealtimeStream, type RealtimeSourceLike } from '@/lib/useRealtime';

/**
 * §163 断线重开的那一格（判决与"为什么不补发帧"写在 `docs/adr/0029-…`）。
 *
 * 为什么这里注入一个假的连接，而不是在真浏览器里断一次线：真浏览器那条路我试过并且失败了——
 * CDP `Network.emulateNetworkConditions({offline:true})` **不会**打断已经建立的 SSE 连接，
 * 页面在 30 秒里一直报"实时：已连接"（那条红用例的原文留在 ADR-0029 的验证一节）。
 * 而这一格的全部语义都在"第几次 open"上：第一次不算、第二次才算，
 * 只有把 open 回调敲两次才能证明那句判断在工作。
 *
 * 下面驱动的是 `openRealtimeStream`——生产里 `useRealtime` 调的就是这一个函数，
 * 不是另写一份可测的平行实现。至于"界面上真的追上了"，要等能造出真断线的那条 e2e；
 * 这一片的限度写在 ADR 后果第 3 条，那 6 例不冒充浏览器凭证。
 *
 * 文件末尾另起一组，钉的是"这根线确实接在铃铛上"——那 6 例只证明信号会发，不证明有人听。
 */

interface BoundHandlers {
  open: () => void;
  error: () => void;
  message: (data: string) => void;
}

class FakeSource implements RealtimeSourceLike {
  readyState = 0;
  closeCalls = 0;
  handlers: BoundHandlers | null = null;
  attach(handlers: BoundHandlers): void {
    this.handlers = handlers;
  }
  close(): void {
    this.closeCalls += 1;
    this.readyState = 2;
  }
}

function harness() {
  const source = new FakeSource();
  const urls: string[] = [];
  const states: string[] = [];
  const events: unknown[] = [];
  let reconnects = 0;

  const stream = openRealtimeStream(
    '/api/realtime?projectId=p1',
    {
      onEvent: (event) => events.push(event),
      onState: (state) => states.push(state),
      onReconnect: () => {
        reconnects += 1;
      },
    },
    (url) => {
      urls.push(url);
      return source;
    },
  );

  // 先问"回调到底挂上没有"：没挂上的话下面每一次敲都只是空操作，
  // 整份用例集就会以"什么都没发生过"的样子绿掉
  const bound = (): BoundHandlers => {
    if (!source.handlers) throw new Error('attach 一次都没被调用：生产代码根本没往这条连接上挂回调');
    return source.handlers;
  };

  return {
    source,
    stream,
    urls,
    states,
    events,
    reconnects: () => reconnects,
    open: () => bound().open(),
    /** 敲一次"连接出错了"，`readyState` 先摆好（浏览器就是这么报的） */
    error: (readyState: number) => {
      source.readyState = readyState;
      bound().error();
    },
    feed: (data: string) => bound().message(data),
  };
}

describe('断线重开：谁该去重读权威（§163 / ADR-0029）', () => {
  it('第一次接上只报状态，不发重读', () => {
    const h = harness();
    h.open();
    expect(h.states).toEqual(['open']);
    // 首连就发一次重读，等于每次进页面都多发一个没有对象的请求
    expect(h.reconnects()).toBe(0);
    expect(h.urls).toEqual(['/api/realtime?projectId=p1']);
    // 交回给调用方去 close 的必须是这条真连接本身，不是另造的一个对象
    expect(h.stream).toBe(h.source);
  });

  it('断掉又接回来：恰好发一次重读，中间那次出错算"还在重连"', () => {
    const h = harness();
    h.open();
    h.error(1); // EventSource.CONNECTING：浏览器自己还会再试
    h.open();
    expect(h.states).toEqual(['open', 'connecting', 'open']);
    expect(h.reconnects()).toBe(1);
  });

  it('反复断连每次都算重开，但第一次永远不算', () => {
    const h = harness();
    h.open();
    for (let round = 0; round < 3; round += 1) {
      h.error(1);
      h.open();
    }
    expect(h.reconnects()).toBe(3);
  });

  it('彻底关掉（readyState=CLOSED）才报 closed——界面那句"以刷新后的数据为准"靠这一格', () => {
    const h = harness();
    h.open();
    h.error(2);
    expect(h.states.at(-1)).toBe('closed');
    // closed 之后浏览器不再自己重连，所以这一格不发重读：发了也没人接
    expect(h.reconnects()).toBe(0);
  });

  it('报文照样过契约：合法的一条送到，坏的两条丢掉', () => {
    const h = harness();
    const good = { type: 'notification', level: 'info', title: '有人赞了你的作品' };
    h.feed(JSON.stringify(good));
    h.feed('这根本不是 JSON');
    h.feed(JSON.stringify({ type: 'notification' })); // 缺 level 与 title
    expect(h.events).toEqual([good]);
  });

  it('卸载时关到底：close 落到那条连接上，一次不多', () => {
    const h = harness();
    h.stream.close();
    expect(h.source.closeCalls).toBe(1);
  });
});

/**
 * 上面 6 例只证明了"重开这一格会发信号"，没证明"有人听"。
 *
 * 为什么单开一组：把 `NotificationBell` 里那句 `onReconnect: () => void refresh()` 删掉，
 * 上面 6 例一条都不会红——信号发给了一个空函数，界面照样停在断线前那一刻。
 * 这正是 §163 要修的用户可见症状，所以这一组从源文件里把那个选项对象读出来，
 * 问它两件事：**有没有这个键**，以及**这个键指向的那段代码调不调 `refresh`**。
 * 扫源码而不是渲染组件：这里没有 jsdom，而且判据就在"接的是哪根线"上。
 */

/** 取 `useRealtime(...)` 那一个参数（花括号配平地扫，不在第一个 `}` 就停） */
function realtimeOptionObject(src: string, marker: string): string {
  const at = src.indexOf(marker);
  if (at === -1) throw new Error(`没扫到 ${marker}：这个文件已经不走这条接口了，下面的判据无从谈起`);
  const open = src.indexOf('{', at + marker.length);
  if (open === -1) throw new Error(`${marker} 后面没有对象字面量`);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  throw new Error(`${marker} 的花括号没配上`);
}

/** 取对象里某个键的值表达式：在深度 0 的那个逗号处收尾，所以嵌套的 `{}`/`()` 里的逗号不会截断它 */
function optionValue(options: string, key: string): string | null {
  const at = options.indexOf(`${key}:`);
  if (at === -1) return null;
  let depth = 0;
  for (let i = at + key.length + 1; i < options.length; i += 1) {
    const ch = options[i];
    if (ch === '{' || ch === '(' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ')' || ch === ']') depth -= 1;
    else if (ch === ',' && depth === 0) return options.slice(at + key.length + 1, i).trim();
  }
  return options.slice(at + key.length + 1).trim();
}

const bellSrc = readFileSync(join(import.meta.dirname, '..', 'src', 'components', 'NotificationBell.tsx'), 'utf8');
const ledgerSrc = readFileSync(join(import.meta.dirname, '..', 'src', 'components', 'TasksLedgerLive.tsx'), 'utf8');

describe('接线：重开那个信号在铃铛上真的接到了重读上（§163 / ADR-0029）', () => {
  it('铃铛只有一个 useRealtime 调用，读得到它的选项对象', () => {
    // 空集不能绿成"干净"：先确认扫的东西存在
    const options = realtimeOptionObject(bellSrc, 'useRealtime(');
    expect(options.length, '选项对象是空的').toBeGreaterThan(0);
    expect(bellSrc.split('useRealtime(').length - 1, '铃铛上开了一条以上的实时连接').toBe(1);
  });

  it('onReconnect 存在，而且它调的就是那个查未读数的 refresh', () => {
    const options = realtimeOptionObject(bellSrc, 'useRealtime(');
    const value = optionValue(options, 'onReconnect');
    if (value === null) {
      throw new Error(
        'NotificationBell 没把 onReconnect 接上：断线期间过来的通知要等下一条事件或用户自己刷新（ADR-0029 的那一格就没人认领了）',
      );
    }
    // 只要求"指向 refresh"，不要求写成某一种箭头函数——但空函数体一定要拦住
    expect(value).toMatch(/\brefresh\s*\(/);
    expect(value, `接的是一段空操作：${value}`).not.toMatch(/=>\s*\{\s*\}/);
  });
});

/**
 * #10 落地时欠的那一条：账本页的 `onReconnect` 补读没有探针（当时如实记在 ROADMAP/TESTING
 * 的「仍然没有测到」里）。当时空着的原因是这里没有 jsdom、真断线又造不出来
 * （ADR-0029 的验证一节写着 CDP 离线模拟打不断已建立的 SSE）。
 * 现在按本文件已经立好的规矩补上：账本页的断线期间一帧 `generation.progress` 都没收到，
 * 靠事件流重读的那张表会停在旧状态——所以"重开 → 立刻重读"这一格必须有人接。
 * 与铃铛同一组判据（接的是 refresh、不是空操作），因为两处要的是同一件事。
 */
describe('接线：账本页的重开补读（#10 欠的那一条，2026-10-10 补）', () => {
  it('账本也只有一个 useRealtime 调用，读得到它的选项对象', () => {
    const options = realtimeOptionObject(ledgerSrc, 'useRealtime(');
    expect(options.length, '选项对象是空的').toBeGreaterThan(0);
    expect(ledgerSrc.split('useRealtime(').length - 1, '账本上开了一条以上的实时连接').toBe(1);
  });

  it('onReconnect 存在，而且它调的就是那个读账本的 refresh', () => {
    const options = realtimeOptionObject(ledgerSrc, 'useRealtime(');
    const value = optionValue(options, 'onReconnect');
    if (value === null) {
      throw new Error(
        'TasksLedgerLive 没把 onReconnect 接上：断线重开后那张表会停在旧状态，而断线期间的进度一帧都没收到（#10 的账本实时只靠事件加速）',
      );
    }
    expect(value).toMatch(/\brefresh\s*\(/);
    expect(value, `接的是一段空操作：${value}`).not.toMatch(/=>\s*\{\s*\}/);
  });
});
