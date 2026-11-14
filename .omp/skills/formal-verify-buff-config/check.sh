#!/bin/bash
# Check the buff-mod config writers (addBbBuff, regroupBuffs) against generated inputs.
#   check.sh                 test the working tree this skill lives in
#   WOTR_ROOT=<dir> check.sh test another copy of the repo
#   check.sh --patch <file>  apply a patch to the snapshot first (prove-can-fail.sh uses this)
# Env: FC_RUNS (inputs per property, default 300), FC_SEED (default fixed).
# Exit: 0 all properties hold, 1 a property broke, 2 cannot run, 3 patch did not apply.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${WOTR_ROOT:-$(cd "$SKILL_DIR/../../.." && pwd)}"
STATE="${XDG_STATE_HOME:-$HOME/.local/state}/verify-wotr/formal-verify-buff-config"
COVERED=(src/server/services/bubble-buffs.ts src/server/routes/saves.ts)

PATCH=""
while [ $# -gt 0 ]; do
  case "$1" in
    --patch) PATCH="$2"; shift 2 ;;
    *) echo "usage: check.sh [--patch <file>]" >&2; exit 2 ;;
  esac
done

command -v bun >/dev/null || { echo "bun is not on PATH (agent shells: source ~/.config/zsh/agent-env.zsh first)" >&2; exit 2; }
[ -f "$ROOT/src/server/services/bubble-buffs.ts" ] || { echo "no src/server/services/bubble-buffs.ts under $ROOT" >&2; exit 2; }

# The code under test runs from a snapshot outside the repo and sees a throwaway game dir, never the real one.
WORK="$STATE/work"
rm -rf "$WORK"
mkdir -p "$WORK/snapshot/src" "$WORK/game" "$STATE/harness" "$STATE/runs"
cp -R "$ROOT/src/server" "$WORK/snapshot/src/server"
if [ -n "$PATCH" ]; then
  patch -s -p1 -d "$WORK/snapshot" <"$PATCH" || { echo "PATCH DID NOT APPLY: $PATCH" >&2; exit 3; }
fi

cp "$SKILL_DIR/harness/package.json" "$SKILL_DIR/harness/bun.lock" "$SKILL_DIR/harness/buff-config.property.test.ts" "$STATE/harness/"
(cd "$STATE/harness" && bun install --frozen-lockfile >/dev/null 2>&1) || { echo "bun install of the pinned fast-check failed in $STATE/harness (first run needs network)" >&2; exit 2; }

LOG="$STATE/runs/$(date -u +%Y%m%dT%H%M%SZ)${PATCH:+-$(basename "$PATCH" .patch)}.log"
rc=0
(cd "$STATE/harness" && env -u FORCE_COLOR NO_COLOR=1 WOTR_SNAPSHOT="$WORK/snapshot/src/server" WOTR_GAME_DIR="$WORK/game" bun test buff-config.property.test.ts) >"$LOG" 2>&1 || rc=$?

echo "---- $ROOT${PATCH:+ + $(basename "$PATCH")}"
grep -E '^(BROKEN|FINDING) |^(✗|\(fail\)) |^ *[0-9]+ (pass|fail)$' "$LOG" || true
echo "log: $LOG"

# GIT_OPTIONAL_LOCKS=0 keeps these two git calls from touching the repo's index.
SYNC="$(grep -oE '^Sync commit: .[0-9a-f]{40}' "$SKILL_DIR/SKILL.md" 2>/dev/null | grep -oE '[0-9a-f]{40}' || true)"
if [ -n "$SYNC" ] && GIT_OPTIONAL_LOCKS=0 git -C "$ROOT" cat-file -e "$SYNC^{commit}" 2>/dev/null; then
  CHANGED="$(GIT_OPTIONAL_LOCKS=0 git -C "$ROOT" diff --name-only "$SYNC" -- "${COVERED[@]}" | tr '\n' ' ')"
  if [ -n "$CHANGED" ]; then
    echo "COVERAGE DRIFT: changed since sync commit ${SYNC:0:7}: ${CHANGED}- read 'Keeping this in step' in SKILL.md"
  else
    echo "coverage: covered files match sync commit ${SYNC:0:7}"
  fi
else
  echo "coverage: $ROOT has no commit ${SYNC:0:7}, so drift from the sync commit was not checked"
fi

if [ "$rc" -eq 0 ]; then echo "RESULT: properties hold"; else echo "RESULT: A PROPERTY BROKE (or a known finding stopped reproducing) - see above"; fi
[ "$rc" -eq 0 ] || exit 1
