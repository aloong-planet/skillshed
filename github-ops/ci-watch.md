# 盯 CI

本文适用于等 CI 运行结果、判断某次运行的结论。入口:[SKILL.md](SKILL.md)「按情形必读的文件」。

## 盯 CI 的可靠方式

**先看这条:用本 skill 自带的 `watch-ci.sh`,不要手写轮询循环。** 命令与用法在本文末尾。

**手写轮询的失败形态是静默空转**:循环把「命令报错」与「条件未成立」压成同一种表现——什么都不发生——而前者永远不会自行成立,看起来跟「CI 还在跑」一模一样,极易被当成"监视器正常超时"放过。典型诱因是版本相关的 flag:装机的 CLI 没有那个 flag 时,循环里每一轮都在报错,命令替换拿到空串,循环永不退出。

两条要求,与 CLI 版本无关:
- **轮询循环里的命令,先单独跑一次确认它有输出。**
- **版本相关的事实不要写进 frontmatter**。description 每轮都注入上下文,把会腐烂的
  细节钉在那儿,等于每轮误导一次;而正文里的过期内容至少还有人读到时能发现。
  frontmatter 只放机制无关的指向("用 watch-ci.sh"),版本细节留在正文。

下面是脚本背后的原理(需要自己查一次状态时用):
`gh run watch --exit-status` 的退出码在某些环境会误报成功/失败。**改用轮询 conclusion**:
```bash
gh run view <run-id> --repo <owner/repo> --json status,conclusion --jq '"\(.status)|\(.conclusion)"'
```
`status=completed` 且 `conclusion=success` 才算成功。

**用本 skill 自带的 `watch-ci.sh`**(本 skill 目录内,下文以 `<skill-dir>` 代指该目录;调用时换成本 skill 实际所在的目录),别每次手写轮询循环:
```bash
<skill-dir>/watch-ci.sh                       # 锚定当前 HEAD:覆盖该 commit 的全部 run,盯到全部完成
<skill-dir>/watch-ci.sh --workflow <名称>     # 只盯该 commit 上指定 workflow 的 run
<skill-dir>/watch-ci.sh <run-id>              # 指定单个 run
INTERVAL=15 <skill-dir>/watch-ci.sh           # 轮询间隔(秒,默认 30)
CREATE_WAIT=300 <skill-dir>/watch-ci.sh       # 等第一个 run 出现的上限(秒,默认 120)
SETTLE=60 <skill-dir>/watch-ci.sh             # 全部完成后再等的静默窗口(秒,默认 20)
TIMEOUT=3600 <skill-dir>/watch-ci.sh          # 总时限(秒,默认 2400)
```
无参时按 HEAD 的 commit 锚定:「取最近一次 run」在推送后立刻调用有
竞态——新 run 未建出来时抓到的是上一轮旧 run,绿得毫无意义。HEAD 没有 run(没推送/不触发
workflow)时明确报错退出,不退回"最近一次"。⚠️ `gh run list --commit` 只认**全长** SHA,
短 SHA 静默返回空。
**一个 commit 触发多个 workflow 时,只看其中一个就会在另一个还在跑时报绿**,所以无参调用覆盖该 commit 的**全部** run:
每轮重读 run 列表,全部 completed 之后再等一个静默窗口(`SETTLE`),列表不变才收尾——各 run 相隔几秒才建出,
由 `workflow_run` 串联的 workflow 要等前一个结束才建出,窗口就是为它们留的;**窗口过后才建出的 run 不在覆盖内**,
串联 workflow 在前一个结束后超过 `SETTLE` 秒才建出的仓库,必须调大 `SETTLE`。只想盯其中一个 workflow 时显式传 `--workflow`。
在目标仓库目录下运行即可(repo 靠 `gh` 从当前目录自动推断,脚本无任何项目硬编码)。轮询 conclusion 到 completed,逐个 run 打印 conclusion 与各 job;退出码:全部 run 均为 success→0,任一 run 为其他结论(含 cancelled、skipped)→1,脚本错误、等不到 run 或超时→2。可后台跑,完成自动通知。
**不得把它接进管道**:判据是调用行里 `watch-ci.sh` 之后不出现 `|`——管道把整条命令的退出码换成末段命令的,上面那三个码当场丢失,而合并要靠它们挡住。要截断输出就先重定向到文件,取到退出码之后再读文件(机制与「用退出码数组补救」的二次陷阱见 review-code/false-greens.md 形态六)。

