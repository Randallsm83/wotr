#!/bin/bash
# Show that the passing properties can fail: apply each broken variant in mutants/ to a snapshot of the code
# and expect check.sh to report the property that variant breaks.
# Exit: 0 every variant was caught, 1 a variant survived or no longer applies.
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bad=0
for patch in "$SKILL_DIR"/mutants/*.patch; do
  name="$(basename "$patch" .patch)"
  breaks="$(sed -n 's/^# breaks: //p' "$patch")"
  out="$("$SKILL_DIR/check.sh" --patch "$patch" 2>&1)"
  rc=$?
  if [ "$rc" -eq 1 ] && echo "$out" | grep -q "^BROKEN $breaks: "; then
    echo "caught    $name"
    echo "$out" | grep "^BROKEN $breaks: " | cut -c1-300 | sed 's/^/            /'
  elif [ "$rc" -eq 3 ]; then
    echo "STALE     $name: the patch no longer applies; rewrite it against the current bubble-buffs.ts"
    bad=1
  else
    echo "SURVIVED  $name: $breaks did not fail (check.sh exit $rc)"
    bad=1
  fi
done
[ "$bad" -eq 0 ] && echo "RESULT: every broken variant was caught" || echo "RESULT: NOT EVERY VARIANT WAS CAUGHT"
exit "$bad"
