#!/usr/bin/env bash
# 轮询一次 GitHub Actions run 到完成,打印 conclusion + 各 job 结果。
#
# 为什么用轮询而非 `gh run watch --exit-status`:后者退出码在部分环境会误报成功/失败,
# 故只信 `gh run view --json status,conclusion`(实测可靠)。
#
# 无参时**锚定当前 HEAD 的 commit**,等它对应的 run 出现再盯。
# 机制:"取最近一次 run"在推送后立刻调用有竞态——新 run 还没建出来,抓到的是
# 上一轮已完成的旧 run,绿得毫无意义。锚定 commit 让"还没有 run"成为可分辨的状态。
#
# 用法:
#   watch-ci.sh                     # 锚定 HEAD:等它的 run 出现,盯到完成
#   watch-ci.sh <run-id>            # 指定 run(跳过锚定)
#   INTERVAL=15 watch-ci.sh         # 轮询间隔(秒,默认 30)
#   CREATE_WAIT=300 watch-ci.sh     # 等 run 出现的上限(秒,默认 120)
#
# 退出码:CI success → 0;失败/取消 → 1;脚本自身错误/等不到 run → 2。
set -uo pipefail

REPO="$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null)" || {
  echo "取 repo 失败(gh 未登录或不在仓库内?)" >&2; exit 2; }

INTERVAL="${INTERVAL:-30}"
CREATE_WAIT="${CREATE_WAIT:-120}"

RUN_ID="${1:-}"
if [ -z "$RUN_ID" ]; then
  # ⚠️ --commit 只认**全长** SHA:传短 SHA 不报错、静默返回空(gh 2.97 实测)
  SHA="$(git rev-parse HEAD 2>/dev/null || true)"
  if [ -n "$SHA" ]; then
    DEADLINE=$(( $(date +%s) + CREATE_WAIT ))
    while :; do
      RUN_ID="$(gh run list --repo "$REPO" --commit "$SHA" --limit 1 \
        --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null || true)"
      [ -n "$RUN_ID" ] && break
      if [ "$(date +%s)" -ge "$DEADLINE" ]; then
        echo "HEAD($(git rev-parse --short HEAD))的 run 在 ${CREATE_WAIT}s 内未出现。" >&2
        echo "可能:还没 push / 该分支不触发 workflow。要盯别的 run 用 watch-ci.sh <run-id>。" >&2
        exit 2
      fi
      sleep 5
    done
    echo "锚定 HEAD $(git rev-parse --short HEAD) → run $RUN_ID"
  else
    # 兜底(gh 认得 repo 但 git rev-parse 失败,罕见):退回旧行为,但把风险说出来
    RUN_ID="$(gh run list --repo "$REPO" --limit 1 --json databaseId --jq '.[0].databaseId')" || {
      echo "取最近 run 失败" >&2; exit 2; }
    echo "⚠️ 未能锚定 commit(git rev-parse 失败),取最近一次 run——可能是旧的" >&2
  fi
fi

echo "轮询 CI run $RUN_ID (repo=$REPO, 每 ${INTERVAL}s)..."

# 最多轮询 ~40min(mac 公证档最慢),防脚本卡死。
for _ in $(seq 1 80); do
  RES="$(gh run view "$RUN_ID" --repo "$REPO" --json status,conclusion --jq '.status + "|" + (.conclusion // "")')" || {
    echo "查询 run 状态失败" >&2; exit 2; }
  STATUS="${RES%%|*}"
  CONCL="${RES##*|}"
  if [ "$STATUS" = "completed" ]; then
    echo ""
    echo "完成: conclusion=$CONCL"
    echo "--- 各 job ---"
    # gh 部分版本不支持 --json jobs;用文本视图 grep job 行(实测可靠)。
    gh run view "$RUN_ID" --repo "$REPO" 2>/dev/null | grep -E "^\s*[✓X✗].*(in [0-9])" || true
    [ "$CONCL" = "success" ] && exit 0 || exit 1
  fi
  sleep "$INTERVAL"
done

echo "超时:run 仍未完成(已轮询上限)" >&2
exit 2