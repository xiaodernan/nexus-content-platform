import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * 真正的规则集（此前 `npm run lint` 只是 `npm run typecheck` 的占位——见 ROADMAP 技术债）。
 *
 * 取向：**只收能抓到 bug 的规则，不收风格规则**。缩进、引号、换行交给 Prettier
 * （`npm run format`），两套工具抢同一件事只会互相打架。所以这里没有 `indent` / `quotes` /
 * `semi` 之类；留下的是"这么写很可能是错的"。
 *
 * 类型感知（type-aware）是重点：`no-floating-promises` 能抓出没 await 的异步调用——
 * 这个仓库里到处是 `await db.insert(...)`，漏一个 await 就是一次静默失败，
 * 而且 typecheck 完全看不见。
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      'playwright-report/**',
      'test-results/**',
      'screenshots/**',
      '**/*.d.ts',
      // Python / 基础设施 / 生成物不在 JS 规则集范围内
      'apps/ai-service/**',
      'contracts/**',
      'infra/**',
      '.nexus-storage/**',
      // Agent 的临时实验区：里面是变异探针与跑批脚本，不属于任何 tsconfig，
      // 类型感知的规则集对它会直接报"文件不在 project service 里"（见 .gitignore 同名条目）
      '.scratch/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        // 让 typescript-eslint 按就近的 tsconfig 解析类型，不必逐个文件写 project
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // ── 异步：这个仓库最容易出事的地方 ────────────────────────────────
      // 没 await 的 Promise 会被静默吞掉（写库失败、CSRF 校验失败都不报错）
      '@typescript-eslint/no-floating-promises': 'error',
      // 把 async 函数塞给期望返回 void 的位置（事件处理器、forEach 回调）
      '@typescript-eslint/no-misused-promises': 'error',
      // await 一个不是 Promise 的东西：通常是"忘了加括号"或改了函数签名
      '@typescript-eslint/await-thenable': 'error',
      // 返回 Promise 的函数却不标注返回类型，容易在重构时悄悄改语义
      '@typescript-eslint/promise-function-async': 'off',

      // ── 类型误用：会产出错误结果的写法 ──────────────────────────────
      // 把对象直接拼进字符串 → "[object Object]"
      '@typescript-eslint/no-base-to-string': 'error',
      // 数组用 for...in（拿到的是下标字符串）
      '@typescript-eslint/no-for-in-array': 'error',
      // delete arr[i]：留下空洞而不是缩短数组
      '@typescript-eslint/no-array-delete': 'error',
      // 把 Promise 当构造函数/类用
      '@typescript-eslint/no-misused-new': 'error',

      // ── 死代码与恒真恒假：多半是逻辑写错了 ──────────────────────────
      '@typescript-eslint/no-unused-vars': [
        'error',
        // 下划线前缀表示"刻意不用"（解构剔除字段时用得到）
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-constant-binary-expression': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-self-compare': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-dupe-else-if': 'error',
      'no-unreachable': 'error',
      'no-fallthrough': 'error',

      // ── 常见笔误 ────────────────────────────────────────────────────
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-throw-literal': 'error',
      'no-prototype-builtins': 'error',
      'no-unsafe-optional-chaining': 'error',
      'no-useless-catch': 'error',
      'no-import-assign': 'error',

      // ── 刻意关掉的（写清原因，免得下一个人以为是漏了） ──────────────
      // "这个条件永远为真/永远为假"看着像死代码，但本仓库的类型在 DB 行、zod 解析、
      // AI 补丁这三条边界上是**偏乐观**的：标着非空的地方运行时真的会是空
      // （上一轮那个"字段不全的节点把画布整页白屏"就是这么来的，
      // 见 packages/design-model/test/malformed-node.test.ts）。
      // 删掉这些判断等于拆防线，所以整条关掉，而不是逐条加 disable。
      '@typescript-eslint/no-unnecessary-condition': 'off',
      // 同理：`as` 断言是这三条边界的通行写法，冗余的那部分交给
      // typecheck 和人审，不在这条规则上消耗注意力。
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      // provider 适配器要贴着自己声明的接口：`async complete()` 里没有 await 是刻意的
      '@typescript-eslint/require-await': 'off',
      // 测试替身与配置回调里的空函数是合法表达
      '@typescript-eslint/no-empty-function': 'off',
      // 类型参数没用到属于清理项，不是 bug
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',
      // 本仓库大量使用 zod 解析后的 `as` 断言与 DB 行到领域对象的映射，
      // no-unsafe-* 会把每一处断言都报一遍，噪音盖过信号。类型边界已经由
      // zod（packages/schemas）+ typecheck 把守，这里不重复。
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      // explicit any 是有意留的口子（第三方库边界），报它只会让人加 eslint-disable
      '@typescript-eslint/no-explicit-any': 'off',
      // 空接口/空对象类型在"占位待填"时是合理表达
      '@typescript-eslint/no-empty-object-type': 'off',
      // 非空断言 `!` 在本仓库用于"上一步已断言存在"的 DB returning 结果，属约定用法
      '@typescript-eslint/no-non-null-assertion': 'off',
      // 风格交给 Prettier
      '@typescript-eslint/no-confusing-void-expression': 'off',
      // 模板字符串里用非字符串是常见且清晰的写法
      '@typescript-eslint/restrict-template-expressions': 'off',
      // 数字与字符串相加在本仓库用于拼 CSS/消息，可控
      '@typescript-eslint/restrict-plus-operands': 'off',
    },
  },

  // 测试文件：允许更松的写法
  {
    files: ['**/test/**/*.ts', '**/*.test.ts', '**/*.spec.ts', 'e2e/**/*.ts', 'scripts/**/*.mts'],
    rules: {
      // 测试里 `expect(...)` 本身不需要 await，且断言表达式常有恒真写法
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-constant-condition': 'off',
      // 并发探测用闭包退出标志（`let stop = false` + `while (!stop)`，由测试主体置 true）。
      // 这条规则只看循环体内有没有改它，看不到跨闭包的改写，对这类桩是误报；生产代码仍受约束。
      'no-unmodified-loop-condition': 'off',
    },
  },

  {
    // scripts/ 与根配置不在任何 package tsconfig 的 include 里，project service 认不到它们，
    // 于是 type-aware 规则直接报"解析不了"。这里显式把它们交给 tsconfig.tools.json——
    // 不是为了少报几条，是因为压测脚本自己就藏过一次"量了 8 个节点却写成 1000 个节点"的事故
    // （见 docs/PERFORMANCE.md），它比产品代码更需要类型检查。
    files: ['scripts/**/*.mts', 'scripts/**/*.ts', 'vitest.config.ts', 'drizzle.config.ts', 'playwright.config.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: ['./tsconfig.tools.json'],
      },
    },
  },

  // 配置文件本身（next / postcss 的 .mjs 配置）：不在任何 tsconfig 里，
  // 只能跑非类型规则——用 extends 关掉 type-aware 那一批，而不是逐个文件加 disable。
  {
    files: ['**/*.config.mjs', '**/*.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
