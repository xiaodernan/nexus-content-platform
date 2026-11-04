#!/bin/bash
# Second pass: does the traversal need --force, and does it also follow a real symlink?
# Targets are throwaway directories outside the repository.
set -u
P=/d/nexus-junction-probe2
rm -rf "$P" 2>/dev/null; mkdir -p "$P"
( cd "$P" && git init -q repo && cd repo && echo x > a.txt && git add a.txt && git -c user.email=p@p -c user.name=p commit -qm base ) > /dev/null 2>&1

new_wt() { # $1 case name, $2 kind (junction|symlink)
  local c="$P/$1"
  mkdir -p "$c/target" "$c/plane_parent"
  for i in 1 2 3; do echo "content-$i" > "$c/target/file$i.txt"; done
  git -C "$P/repo" worktree add -q --detach "$(cygpath -w "$c/plane")" > /dev/null 2>&1
  mkdir -p "$c/plane/node_modules/@nexus"
  local tn=$(cygpath -w "$c/target") ln=$(cygpath -w "$c/plane/node_modules/@nexus/pkg")
  if [ "$2" = junction ]; then cmd //c mklink //J "$ln" "$tn" > /dev/null 2>&1
  else cmd //c mklink "$ln" "$tn" > /dev/null 2>&1; fi
  echo "  before: target files=$(ls "$c/target" | wc -l) link-kind=$2"
}
after() { local c="$P/$1"; [ -d "$c/plane" ] && echo "plane STILL there" || echo "plane gone"; echo "  TARGET files after: $(ls "$c/target" 2>/dev/null | wc -l)"; }

echo "== case 5: git worktree remove  (NO --force) =="
new_wt noforce junction
git -C "$P/repo" worktree remove "$(cygpath -w "$P/noforce/plane")" 2>&1 | head -3
after noforce

echo "== case 6: git worktree remove --force on a SYMLINK into the target =="
new_wt sym symlink
git -C "$P/repo" worktree remove --force "$(cygpath -w "$P/sym/plane")" 2>&1 | head -3
after sym

echo "== case 7: --force with the junction UNLINKED first =="
new_wt unlinked junction
( cd "$P/unlinked/plane/node_modules/@nexus" && node -e "require('fs').rmdirSync('pkg')" ) 2>&1 | head -2
git -C "$P/repo" worktree remove --force "$(cygpath -w "$P/unlinked/plane")" 2>&1 | head -3
after unlinked

rm -rf "$P" 2>/dev/null; echo "probe dir gone: $([ -d "$P" ] && echo no || echo yes)"
