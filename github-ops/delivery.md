# 受委派交付

本文适用于被派来执行交付的子 agent(下称交付方):委派方给出检出、分支、交出的 commit 与交付说明文件,要求推送分支、以该文件为描述开或更新 PR、等 PR 上的 CI 并交回。入口:[SKILL.md](SKILL.md)「按情形必读的文件」。

## 交付方的边界

- 不得改动检出里或施工记录目录里的任何文件,不得提交,不得改写历史(rebase、force push、reset),不得合并,不得关闭、编辑或评论任何 issue。
- 不得再派子 agent 执行本文的任何部分,等 CI 也由交付方自己运行。
- 下文「执行」一节各项之外,不得做别的事;某项做不下去的,停在那里,按「交回」一节交回已有的各项与做不下去的原因。

## 执行

必须依次执行:

1. 进入委派方给的检出路径,运行 `git branch --show-current`、`git rev-parse HEAD` 与 `git status --porcelain`。分支或 SHA 与委派方给的不同,或 `git status --porcelain` 有输出的,不得推送,把三条命令的输出逐字交回后结束。
2. 按 [SKILL.md](SKILL.md) 第 1 节自检本分支的 commit message 与交付说明文件,按第 6 节核对交付说明文件与 PR 标题的语言;有不合的,不得推送,交回哪一处不合后结束。
3. 按 SKILL.md 第 2 节「开 PR 前自检基线」核对本分支相对默认分支带了哪些 commit;基线有错的,不得推送,把 `git log --oneline origin/<默认分支>..HEAD` 的输出交回后结束。
4. 推送分支(`git push -u origin <分支>`)。委派方给了已有 PR 的,推送后用 `gh pr edit <PR> --body-file <交付说明文件>` 把描述换成交付说明;没给的,用 `gh pr create --base <默认分支> --head <分支> --title <标题> --body-file <交付说明文件>` 开 PR。
5. 等 PR 头上的 CI:按 [ci-watch.md](ci-watch.md)「盯的一方」第 2 至 5 项自己运行 `watch-ci.sh`,参数与环境变量取委派方给的。委派方写明「不等 CI」的,跳过本项。
6. 运行 `gh pr view <PR> --json url,headRefOid`,取 PR 的地址与头的 commit。

## 交回

交回必须包含下列各项,每一项都从命令输出与文件里逐字复制,不得改写、概括或省略:

- PR 的地址与第 6 项给出的 PR 头的 commit。
- `watch-ci.sh` 的退出码,以及其日志里从第一个结论行到文件末尾的全部内容(没有结论行的,日志全文);按第 5 项跳过了等 CI 的,改为写明「没有等 CI」,下面两项不写。
- 退出码为 1 的,按 ci-watch.md「盯的一方」第 6 项最后一条附上每个结论不是 `success` 的 run 的失败输出。
- 日志文件与退出码文件的绝对路径。
