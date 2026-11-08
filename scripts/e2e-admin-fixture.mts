/**
 * e2e 的 admin 夹具账号：把 `e2e/observability.spec.ts` 已经注册出来的那个账号提成 role=admin。
 * 用法：`npm run e2e:admin-fixture`（注册那一步要由浏览器跑一次，因为口令要走产品自己的哈希）
 *
 * 为什么要这么绕：产品里改角色只有 `/api/admin/users/[id]` 这一条路，而它要求调用方**已经是** admin
 * ——本地库里一个 admin 都没有（实测 `nexus` 库 5325 个账号，admin 0 个），所以自举只能从库外做一次。
 * 这是本地开发数据的动作，不是把产品里的门拆了：那道路由的"登录 + role=admin + CSRF"一条都没少。
 *
 * 顺序是有意的：**不在这里建账号**。自己插一行 users 就等于绕过了注册链路（口令哈希、guest 判定、
 * 首次体验那套），页面上看到的"登录成功"就再也不是真登录。所以这一份只 update，账号不存在时报错并指路。
 */
import postgres from 'postgres';

const url = process.env.NEXUS_DATABASE_URL ?? 'postgres://nexus:nexus_dev_only@localhost:55100/nexus';
const email = process.env.NEXUS_E2E_ADMIN_EMAIL ?? 'obs-admin+fixture@nexus.test';

/** 防一手"环境变量还指着别的库"：这一份只应该动本地那块开发盘 */
if (!url.includes('nexus_dev_only')) {
  console.error(`拒绝执行：NEXUS_DATABASE_URL 看着不像本地开发库（${url.replace(/:[^:@/]*@/, ':***@')}）`);
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
const [row] = await sql`select id, email, role, created_at from users where email = ${email} limit 1`;

if (!row) {
  console.error(
    `库里没有 ${email}。先跑一次 \`npx playwright test e2e/observability.spec.ts\`——` +
      '它会从界面上把这个账号注册出来（口令与产品里那条链路同一份），然后再跑这一条。',
  );
  await sql.end({ timeout: 5 });
  process.exit(1);
}

if (row.role === 'admin') {
  console.log(`${email} 已经是 admin（id ${row.id}），不用改。`);
} else {
  await sql`update users set role = 'admin' where id = ${row.id}`;
  const [after] = await sql`select role from users where id = ${row.id}`;
  console.log(`${email}：role ${row.role} → ${after?.role}（id ${row.id}）`);
  if (after?.role !== 'admin') {
    console.error('回读不是 admin：改动没落地（枚举值？权限？）');
    await sql.end({ timeout: 5 });
    process.exit(1);
  }
}

const admins = await sql`select email from users where role = 'admin' order by created_at`;
console.log(`现在库里的 admin：${admins.map((a) => a.email).join(', ') || '（ none ）'}`);
await sql.end({ timeout: 5 });
