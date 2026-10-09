#!/usr/bin/env bash
# Poll GitHub Actions runs until they finish; print each run's conclusion and job results.
#
# Why poll instead of `gh run watch --exit-status`: that command's exit code misreports success or
# failure in some environments, so this script trusts only `gh run view/list --json status,conclusion`.
#
# With no run id the script anchors to the current HEAD commit and covers EVERY run for it — a commit
# that triggers several workflows is green only when all of them are. Taking "the latest run", or the
# first run found for the commit, gives a green that does not cover what it appears to cover: right
# after a push the new run may not exist yet (an old run gets reported), and when several workflows
# trigger, a short one can finish while a long one is still running.
#
# Knowing that all runs exist: runs for one commit are created seconds apart, and workflows chained
# with `workflow_run` are created only after their trigger finishes. So the run list is re-read on
# every poll, and the script finishes only after every listed run has completed AND the list stayed
# unchanged through one further quiet window (SETTLE). A run created later than that window after
# everything else completed is not covered.
#
# Usage:
#   watch-ci.sh                          # every run for HEAD's commit
#   watch-ci.sh --workflow <name>        # only that workflow's runs for HEAD's commit
#   watch-ci.sh <run-id>                 # one specific run (no anchoring)
#   INTERVAL=15 watch-ci.sh              # poll interval in seconds (default 30)
#   CREATE_WAIT=300 watch-ci.sh          # how long to wait for the first run to appear (default 120)
#   SETTLE=60 watch-ci.sh                # quiet window after all runs complete (default 20)
#   TIMEOUT=3600 watch-ci.sh             # overall limit in seconds (default 2400; notarization is slow)
#
# Exit codes: every run concluded success → 0; any other conclusion (failure, cancelled, skipped,
# timed_out, ...) → 1; script error, no run appearing, or timeout → 2.
set -uo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: watch-ci.sh [--workflow <name>] | watch-ci.sh <run-id>
Environment: INTERVAL (30) CREATE_WAIT (120) SETTLE (20) TIMEOUT (2400), all in seconds.
USAGE
  exit 2
}

WORKFLOW=""
RUN_ID=""
while [ $# -gt 0 ]; do
  case "$1" in
    --workflow) [ $# -ge 2 ] || usage; WORKFLOW="$2"; shift 2 ;;
    -h|--help) usage ;;
    -*) echo "Unknown option: $1" >&2; usage ;;
    *) [ -z "$RUN_ID" ] || usage; RUN_ID="$1"; shift ;;
  esac
done
if [ -n "$RUN_ID" ] && [ -n "$WORKFLOW" ]; then
  echo "--workflow applies only when anchoring to HEAD; drop it when passing a run id." >&2; exit 2
fi

REPO="$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null)" || {
  echo "Could not resolve the repository (is gh logged in, and is this inside a clone?)" >&2; exit 2; }

INTERVAL="${INTERVAL:-30}"
CREATE_WAIT="${CREATE_WAIT:-120}"
SETTLE="${SETTLE:-20}"
TIMEOUT="${TIMEOUT:-2400}"
START=$(date +%s)

# One line per run: id, workflow, event, status, conclusion (tab-separated).
FIELDS='.[] | [(.databaseId|tostring), .workflowName, .event, .status, (.conclusion // "")] | @tsv'

print_jobs() {
  # Some gh versions do not support `--json jobs`; the text view's job lines are reliable.
  gh run view "$1" --repo "$REPO" 2>/dev/null | grep -E "^\s*[✓X✗].*(in [0-9])" || true
}

report() {
  # $1: run lines as produced by FIELDS. Prints every run with its jobs; returns 0 only if all succeeded.
  local ok=0 id wf ev st concl
  echo ""
  while IFS="$(printf '\t')" read -r id wf ev st concl; do
    [ -n "$id" ] || continue
    echo "== $wf ($ev) run $id: conclusion=$concl"
    print_jobs "$id"
    [ "$concl" = "success" ] || ok=1
  done <<EOF
$1
EOF
  return $ok
}

if [ -n "$RUN_ID" ]; then
  echo "Polling run $RUN_ID (repo=$REPO, every ${INTERVAL}s)..."
  while :; do
    LINE="$(gh run view "$RUN_ID" --repo "$REPO" --json databaseId,workflowName,event,status,conclusion \
      --jq "[.] | $FIELDS")" || { echo "Querying the run failed" >&2; exit 2; }
    [ -n "$LINE" ] || { echo "Querying the run returned nothing" >&2; exit 2; }
    if [ "$(printf '%s\n' "$LINE" | cut -f4)" = "completed" ]; then
      report "$LINE" && exit 0 || exit 1
    fi
    [ $(( $(date +%s) - START )) -lt "$TIMEOUT" ] || { echo "Timed out: the run has not completed" >&2; exit 2; }
    sleep "$INTERVAL"
  done
fi

# `gh run list --commit` accepts only a FULL sha: a short one returns an empty list without an error.
SHA="$(git rev-parse HEAD 2>/dev/null)" || { echo "Not inside a git checkout; pass a run id instead." >&2; exit 2; }
SHORT="$(git rev-parse --short HEAD)"
echo "Anchored to HEAD $SHORT${WORKFLOW:+, workflow \"$WORKFLOW\"} (repo=$REPO, every ${INTERVAL}s)..."

PREV_IDS=""
SETTLED=0
while :; do
  if [ -n "$WORKFLOW" ]; then
    RUNS="$(gh run list --repo "$REPO" --commit "$SHA" --workflow "$WORKFLOW" --limit 100 \
      --json databaseId,workflowName,event,status,conclusion --jq "$FIELDS")" || {
      echo "Listing runs failed (does the workflow \"$WORKFLOW\" exist?)" >&2; exit 2; }
  else
    RUNS="$(gh run list --repo "$REPO" --commit "$SHA" --limit 100 \
      --json databaseId,workflowName,event,status,conclusion --jq "$FIELDS")" || {
      echo "Listing runs failed" >&2; exit 2; }
  fi
  ELAPSED=$(( $(date +%s) - START ))

  if [ -z "$RUNS" ]; then
    if [ "$ELAPSED" -ge "$CREATE_WAIT" ]; then
      echo "No run for HEAD $SHORT appeared within ${CREATE_WAIT}s." >&2
      echo "Possibly not pushed yet, or no workflow triggers for this ref. To watch another run: watch-ci.sh <run-id>." >&2
      exit 2
    fi
    sleep 5
    continue
  fi

  IDS="$(printf '%s\n' "$RUNS" | cut -f1 | sort | tr '\n' ' ')"
  if [ "$IDS" != "$PREV_IDS" ]; then
    PREV_IDS="$IDS"
    SETTLED=0
    echo "Runs for $SHORT:"
    printf '%s\n' "$RUNS" | awk -F'\t' '{ printf "  %s  %s (%s)\n", $1, $2, $3 }'
  fi

  PENDING="$(printf '%s\n' "$RUNS" | awk -F'\t' '$4 != "completed"' | wc -l | tr -d ' ')"
  if [ "$PENDING" -eq 0 ]; then
    # Done only if the run set is still unchanged after one quiet window.
    if [ "$SETTLED" -eq 1 ]; then
      report "$RUNS" && exit 0 || exit 1
    fi
    SETTLED=1
    sleep "$SETTLE"
    continue
  fi
  SETTLED=0

  [ "$ELAPSED" -lt "$TIMEOUT" ] || { echo "Timed out: $PENDING run(s) still not completed" >&2; exit 2; }
  sleep "$INTERVAL"
done
