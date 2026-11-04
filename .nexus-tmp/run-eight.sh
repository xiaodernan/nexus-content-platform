#!/bin/bash
cd /d/终极项目 || exit 1
fail=0
for f in color commit-echo door-kill log-window reaper-survivor record-window report-kill report-window; do
  start=$(date +%s)
  if node "docs/evidence/agents/${f}-proof.mjs" > ".nexus-tmp/row-${f}.log" 2>&1; then
    last=$(tail -1 ".nexus-tmp/row-${f}.log")
    echo "OK   ${f} ($(( $(date +%s) - start ))s) last: ${last:0:150}"
  else
    fail=1
    echo "RED  ${f} ($(( $(date +%s) - start ))s)"
    tail -4 ".nexus-tmp/row-${f}.log"
  fi
done
echo "eight rows: exit-failures=$fail"
exit $fail
