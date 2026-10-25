# Issue 操作

本文适用于新建、查看、评论、改标签或关闭 Issue。入口:[SKILL.md](SKILL.md)「按情形必读的文件」;SKILL.md 的规则同时生效。

## Issue 操作

`gh` 从**当前工作目录**推断仓库。因此在目标仓库的 clone 之外操作时,每条命令都必须显式带
`-R <owner>/<repo>`——在 A 仓库的工作目录里往 B 仓库建票是常态,漏掉 `-R` 不会报错,票会静默
建到当前仓库里去。判据:命令里出现 issue 编号或要新建票,而 `pwd` 不在该仓库的 clone 内,就必须有 `-R`。

```bash
gh issue create -R <owner>/<repo> --title "…" --body "$(cat <<'BODY'
多行正文写在 heredoc 里
BODY
)"
gh issue view   <n> -R <owner>/<repo> --comments
gh issue comment <n> -R <owner>/<repo> --body "…"
gh issue edit   <n> -R <owner>/<repo> --add-label "…"   # 或 --remove-label
gh issue close  <n> -R <owner>/<repo> --comment "…"
```

**多行正文一律用 heredoc**,不要靠引号转义拼接:正文里的反引号、`$`、换行在双引号中会被 shell
解释,拼出来的票在 GitHub 上与本地看到的不是同一份内容。

一次取全字段(比逐票 `view` 少几轮往返):

```bash
gh issue list -R <owner>/<repo> --state open \
  --json number,title,body,labels,comments \
  --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'
```

票的标题、正文与评论同样受 [SKILL.md](SKILL.md) 第 1 节约束:**无 AI 署名**。

