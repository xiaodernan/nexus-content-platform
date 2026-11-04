#!/bin/bash
# Junction-following probe: which removal mechanism, on THIS box, deletes THROUGH a Windows junction.
# Every target is a throwaway directory outside the repository — the probe never points at the graded tree.
set -u
P=/d/nexus-junction-probe
rm -rf "$P" 2>/dev/null
mkdir -p "$P"

mk_case() { # $1 = case dir name; makes target/ (3 files) and plane/node_modules/@nexus -> junction at target
  local c="$P/$1"
  mkdir -p "$c/target" "$c/plane/node_modules/@nexus"
  for i in 1 2 3; do echo "content-$i" > "$c/target/file$i.txt"; done
  local tn=$(cygpath -w "$c/target") pn=$(cygpath -w "$c/plane/node_modules/@nexus/pkg")
  cmd //c mklink //J "$pn" "$tn" > /dev/null 2>&1 || echo "  mklink FAILED for $1"
  echo "  target files before: $(ls "$c/target" | wc -l) · junction reads through: $(ls "$c/plane/node_modules/@nexus/pkg" 2>/dev/null | wc -l)"
}

alive() { local c="$1"; [ -d "$c/target" ] && ls "$c/target" 2>/dev/null | wc -l || echo "0(dir gone)"; }

echo "== case 1: Node fs.rmSync(plane,{recursive,force}) =="
mk_case node
node -e "require('fs').rmSync(process.argv[1],{recursive:true,force:true})" "$(cygpath -w "$P/node/plane")" 2>&1 | head -3
echo "  plane gone: $([ -d "$P/node/plane" ] && echo no || echo yes) · TARGET files after: $(alive "$P/node")"

echo "== case 2: MSYS rm -rf plane =="
mk_case msys
rm -rf "$P/msys/plane"
echo "  plane gone: $([ -d "$P/msys/plane" ] && echo no || echo yes) · TARGET files after: $(alive "$P/msys")"

echo "== case 3: git worktree remove --force =="
mkdir -p "$P/repo"
( cd "$P/repo" && git init -q . && echo x > a.txt && git add a.txt && git -c user.email=p@p -c user.name=p commit -qm base ) > /dev/null 2>&1
git -C "$P/repo" worktree add -q --detach "$P/git/plane" > /dev/null 2>&1
mkdir -p "$P/git/plane/node_modules/@nexus"
for i in 1 2 3; do echo "content-$i" > "$P/git/target/file$i.txt" 2>/dev/null || { mkdir -p "$P/git/target"; echo "content-$i" > "$P/git/target/file$i.txt"; }; done
cmd //c mklink //J "$(cygpath -w "$P/git/plane/node_modules/@nexus/pkg")" "$(cygpath -w "$P/git/target")" > /dev/null 2>&1
echo "  target files before: $(alive "$P/git")"
git -C "$P/repo" worktree remove --force "$P/git/plane" 2>&1 | head -3
echo "  plane gone: $([ -d "$P/git/plane" ] && echo no || echo yes) · TARGET files after: $(alive "$P/git")"

echo "== case 4: cmd rmdir /S /Q plane =="
mk_case cmd
cmd //c "rmdir /S /Q $(cygpath -w "$P/cmd/plane")" > /dev/null 2>&1
echo "  plane gone: $([ -d "$P/cmd/plane" ] && echo no || echo yes) · TARGET files after: $(alive "$P/cmd")"

echo "== cleanup =="
rm -rf "$P" 2>/dev/null
echo "probe dir gone: $([ -d "$P" ] && echo no || echo yes)"
