# 盯 CI

本文适用于等 CI 运行结果、判断某次运行的结论。入口:[SKILL.md](SKILL.md)「按情形必读的文件」。

## 盯 CI 的可靠方式

**先看这条:用本 skill 自带的 `watch-ci.sh`,不要手写轮询循环。** 命令与用法在本节末尾。

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
在目标仓库目录下运行即可(repo 靠 `gh` 从当前目录自动推断,脚本无任何项目硬编码)。轮询 conclusion 到 completed,逐个 run 打印 conclusion 与各 job;退出码:全部 run 均为 success→0,任一 run 为其他结论(含 cancelled、skipped)→1,脚本错误、等不到 run 或超时→2。可后台跑,完成自动通知;它在跑时的等待必须按全局指令「等待后台工作」进行。
**不得把它接进管道**:判据是调用行里 `watch-ci.sh` 之后不出现 `|`——管道把整条命令的退出码换成末段命令的,上面那三个码当场丢失,而合并要靠它们挡住。要截断输出就先重定向到文件,取到退出码之后再读文件(机制与「用退出码数组补救」的二次陷阱见 review-code/false-greens.md 形态六)。

## 交给子 agent 盯

当前工具能派子 agent 时,等 CI 必须交给子 agent,不得在自己的会话里运行 `watch-ci.sh`;不能派子 agent 的,按「盯 CI 的可靠方式」一节自己运行。被派来盯 CI 的子 agent 不适用本条,不得再往下派,必须按本节「盯的一方」自己运行。机理:CI 结束后读结果、失败后读日志的每一次调用,都要重读调用者的全部上下文;子 agent 的上下文只有本 skill 与这一次的输出。

下文称派出子 agent 的一方为委派方,被派出的子 agent 为盯的一方。

### 委派方:派出

当前工具能为子 agent 指定模型时,必须指定最新一代里最小的一档:工具给的是档位别名的,取最小档的别名;只能填具体型号的,取最新一代的最小型号,不得因为更便宜而取旧一代的型号。交给盯的一方的指示必须写明下列四项,缺任一项不得派出:

1. 目标仓库检出的绝对路径。
2. 要盯的 commit 的完整 SHA,取自推送后在该检出里运行 `git rev-parse HEAD` 的输出;盯指定 run 的,不写 SHA,写明 run-id。
3. 要传给 `watch-ci.sh` 的参数与环境变量(`--workflow`、`SETTLE` 等);没有的写明「无」。
4. 要求它按当前工具的 skill 机制载入本 skill、完整读取本文件,并按本节「盯的一方」执行。

### 盯的一方

必须依次执行下列各项,不得做其中没有的事:不得改代码、重跑或取消 run、推送、合并。

1. 进入委派方给的检出路径,运行 `git rev-parse HEAD`。委派方给的是 SHA 而输出与它不同的,不得启动 `watch-ci.sh`,把两个 SHA 逐字交回后结束。
2. 用 `mktemp -d` 新建一个目录,日志文件与退出码文件都放在其中,不得沿用以前的文件——留有旧退出码文件的路径,脚本还没结束就会被读成已结束。
3. 运行 `date +%s` 记下启动时刻,再在后台启动下面这一行,`<参数>` 换成委派方给的参数,环境变量写在行首:
   ```bash
   <skill-dir>/watch-ci.sh <参数> > <目录>/watch-ci.log 2>&1; echo $? > <目录>/exit-code
   ```
4. 等到 `<目录>/exit-code` 出现。等待期间只得检查这个文件是否存在,不得读日志文件。距启动时刻已超过 `TIMEOUT`(委派方没给的取 2400 秒)加 120 秒而文件仍未出现的,停止等待,交回里写明「退出码文件未出现」,并逐字附上日志全文与日志文件的绝对路径。
5. 退出码为 1 的,对结论行(以 `== ` 开头的行)里 `conclusion` 不是 `success` 的每个 run 运行下面两行,再读这两个文件;命令报错的照常往下做,报错信息已在文件里:
   ```bash
   gh run view <run-id> > <目录>/run-<run-id>.txt 2>&1
   gh run view <run-id> --log-failed > <目录>/failed-<run-id>.log 2>&1
   ```
6. 交回必须包含下列各项。每一项都必须从命令输出与文件里逐字复制,不得改写、概括或省略:
   - 第 1 项 `git rev-parse HEAD` 的输出;盯指定 run 的,另写 run-id。
   - `<目录>/exit-code` 的内容。
   - `<目录>/watch-ci.log` 里从第一个结论行到文件末尾的全部内容;没有结论行的,日志全文。
   - 日志文件与退出码文件的绝对路径。
   - 退出码为 1 的,每个非 `success` 的 run 另附:`run-<run-id>.txt` 全文;`failed-<run-id>.log` 里说明失败原因的输出行(断言失败信息、编译错误、报错堆栈的首段、命令自身的报错),该文件不超过 50 行的附全文;以及这两个文件的绝对路径。

### 委派方:核对交回

收到交回后必须逐项核对,三项都成立才得把交回的退出码当作 `watch-ci.sh` 的退出码使用:

1. 交回的 SHA 与派出时写明的 SHA 相同(盯指定 run 的,比 run-id)。
2. 退出码是 0、1、2 之一。
3. 退出码为 0 时,至少有一个结论行,且每个结论行都是 `conclusion=success`;退出码为 1 时,至少有一个结论行不是 `conclusion=success`。

任一项不成立、交回缺了「盯的一方」第 6 项的任何一项,或交回写明退出码文件未出现的,不得采信交回:必须自己读交回写明的日志文件与退出码文件,按文件内容判定;文件读不到的,按「盯 CI 的可靠方式」一节自己重新运行 `watch-ci.sh`。三项都成立的,不得再读这两个文件。

交回写明检出的 `HEAD` 与派出时写明的 SHA 不同的,不得直接重新运行 `watch-ci.sh`——它锚定检出的 `HEAD`,会去盯另一个 commit;必须先让检出回到该 SHA,或改用该 commit 的 run-id 重新派出。
