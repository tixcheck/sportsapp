#!/usr/bin/env bash
# Are PROGRESS.md and HANDOFF.md behind the commits on this branch?
#
# PROGRESS.md once drifted 80 commits (2026-08-22 -> 2026-09-08) and HANDOFF.md
# spent three weeks claiming migrations stopped at 0073 when 0116 was live.
# Both files exist to tell the next session what is true; a stale one is worse
# than an absent one, because it gets believed.
#
# Reads nothing from stdin, writes one JSON object to stdout. Never fails the
# hook: any problem exits 0 with no output, because a doc reminder must not be
# able to break a session.
#
# Usage: docs-staleness.sh session-start | stop

set -uo pipefail
mode="${1:-stop}"

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

# Commits since each doc was last touched. A doc updated in the same commit as
# the code it describes reports 0, which is the shape we want people to aim at.
behind() {
  local file="$1" last
  [ -f "$file" ] || { echo 0; return; }
  last=$(git log -1 --format=%H -- "$file" 2>/dev/null)
  [ -n "$last" ] || { echo 0; return; }
  git rev-list --no-merges --count "$last..HEAD" 2>/dev/null || echo 0
}

progress=$(behind PROGRESS.md)
handoff=$(behind HANDOFF.md)

# HANDOFF is a state snapshot, not a log — it legitimately goes longer between
# edits, so it gets a looser threshold than the per-session PROGRESS log.
[ "$progress" -ge 1 ] 2>/dev/null || progress=0
[ "$handoff" -ge 10 ] 2>/dev/null || handoff=0
[ "$progress" -eq 0 ] && [ "$handoff" -eq 0 ] && exit 0

parts=""
[ "$progress" -gt 0 ] && parts="PROGRESS.md is $progress commit(s) behind"
[ "$handoff" -gt 0 ] && parts="${parts:+$parts; }HANDOFF.md is $handoff commit(s) behind"

esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

if [ "$mode" = "session-start" ]; then
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' \
    "$(esc "Session docs check: $parts. Per CLAUDE.md, update these as part of shipping — record what shipped in PROGRESS.md, and correct HANDOFF.md wherever it now describes something untrue (applied migrations, current state, known quirks). Verify claims against the repo or the live database rather than restating what the file already says.")"
else
  printf '{"systemMessage":"%s"}\n' \
    "$(esc "Docs reminder: $parts. Update PROGRESS.md (what shipped) and HANDOFF.md (what is now true) before this work is considered done.")"
fi
