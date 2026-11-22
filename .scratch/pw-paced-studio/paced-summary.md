# paced e2e 汇总

spec=e2e/studio.spec.ts shards=5 cooldownMin=61
产品里的限流一字未改；片间等的是滑动窗口腾名额。

- 2026-11-05 20:18:54 片 1/5（发起 12 条，Playwright 报 12 条）：exit=0，passed=12 failed=0 skipped=0｜12 passed (3.9m)
- 2026-11-05 20:49:44 片 2/5：exit=3221225794，passed=0 failed=0 skipped=0｜(exit=3221225794 且没读到汇总行——那一片多半根本没跑起来)
- 2026-11-05 21:50:44 片 3/5：exit=3221225794，passed=0 failed=0 skipped=0｜(exit=3221225794 且没读到汇总行——那一片多半根本没跑起来)
- 2026-11-05 22:51:44 片 4/5：exit=3221225794，passed=0 failed=0 skipped=0｜(exit=3221225794 且没读到汇总行——那一片多半根本没跑起来)
- 2026-11-05 23:52:45 片 5/5：exit=3221225794，passed=0 failed=0 skipped=0｜(exit=3221225794 且没读到汇总行——那一片多半根本没跑起来)
