# CI 检查门禁与分支保护

门禁 = 一个在 PR 与默认分支 push 上跑的检查 workflow + 一条把它的 `CI gate` job 设为必需的分支规则。
两者缺一不可:只有 workflow 而不设必需,红了照样能合;只设必需而 workflow 覆盖不全,绿了也说明不了什么。

## 1. 门禁 workflow

### 存在性判据

```bash
grep -nE "pnpm (run )?(test|typecheck|check)" .github/workflows/*.yml
```

无输出 = 这个仓库的代码在 GitHub 上从未被检查过,质量只靠本地自觉,且分支保护无 required check 可选。

**发版 workflow 不算门禁**:它通常只在 `push: tags` 上触发,只负责打包发布。门禁必须独立成一个 workflow,触发条件是 `pull_request` + `push` 到默认分支。

### 最小内容

typecheck → test → build,各子包都要覆盖。三者互不替代:

- typecheck 抓类型错
- test 抓行为
- build 抓构建期错误(模块解析、插件配置、产物生成),这些 typecheck 看不见

### 骨架

骨架是 [assets/ci-routing/ci.yml](assets/ci-routing/ci.yml),怎么放见 §2「资产怎么放」。产品 job 的步骤按上面的「最小内容」写;有独立 lockfile、不在 workspace 内的子包,必须在用到它的 job 里另跑一次 `pnpm install --frozen-lockfile`,`working-directory` 指向该子包。

### Node 版本:不能沿用打包 workflow 的版本

打包 job 与检查 job 对 node 的需求不同,同一个版本号在前者能过、在后者会炸:

- 打包时 runner 的 node 只用于跑构建工具;**产物里跑的是运行时自带的 node**(Electron 等),与 runner 无关。
- 检查时测试**直接在 runner 的 node 上执行**,项目用到的内置模块必须由它提供。

典型触发点:`node:sqlite` 需 Node ≥ 22.5、`node:test` 的部分 API、原生 fetch/WebSocket 的版本差异。判据是**CI 的 node 版本不低于本地开发用的版本**,而不是"复制隔壁 workflow"。

排查方式:
<!-- example -->
```bash
node -v                                    # 本地
grep -rln "node:sqlite\|node:test" src/    # 项目用到的版本敏感内置模块
```

### 各步骤落地前先本地按 CI 的顺序实跑一遍

包括每个子包各自的 `--frozen-lockfile` install。lockfile 不同步、子包依赖没装、脚本名拼错这类问题,本地一次就能暴露,不必等 CI 排队。

## 2. 固定名称的 gate 与按改动范围路由

本节约束分支规则登记哪些必需检查、门禁 workflow 的 job 结构,以及用 [assets/ci-routing/](assets/ci-routing/) 按 PR 的改动路径决定哪些产品 job 运行。分类与判定的固定行为写在 `ci-scope.mjs` 与 `ci-gate.mjs` 的文件头,本节不复述。

### 必需检查只登记 gate

- 分支规则的必需检查必须只登记门禁 workflow 的 `CI gate`,加上别的 workflow 里在每个 PR 上都运行、且不是部署类的检查(§4「不选部署类检查」);不得登记任何产品 job,只有一个产品的仓库同样不得。机理:必需检查按名字匹配,登记了产品 job 的仓库,日后拆分 job 或开始路由时就得改必需检查的名字(§4「改必需检查的名字」),其间顺序错一步,要么所有 PR 卡在等待一个不再运行的检查,要么门禁静默失效;只登记 gate,这些改动都不碰必需检查。
- 门禁 workflow 不得写 workflow 级的 `paths` 或 `paths-ignore`:整个 workflow 不运行时,必需检查停在等待、PR 合不了;路由只能落在 job 级的 `if` 上,被跳过的 job 才会报告为跳过。

### 资产怎么放

新建门禁时必须把 [assets/ci-routing/](assets/ci-routing/) 的文件按下表放进仓库;只有一个产品的仓库也一样,`routing.json` 里只写一个范围:

| 资产 | 放到 | 怎么改 |
|---|---|---|
| `ci-scope.mjs`、`ci-gate.mjs`、`ci-routing.test.mjs` | `.github/ci/` | 不得改代码;注释按 [产物固定名称](../repo-scaffold/artifact-names.md)「资产」节改写语言的,不算改代码 |
| `routing.json` | `.github/ci/` | 写成本仓库的范围与规则,按下面「写 routing.json」 |
| `routing-rules.test.mjs` | `.github/ci/` | 写成本仓库的用例,按下面「写 routing.json」最后一条 |
| `ci.yml` | `.github/workflows/` | 写成本仓库的 job,按下面「job 与 routing.json 对齐」 |

- **判据**:前三个文件逐行与资产比较,不同的行只能是注释行。机理:路由的安全靠的正是这几个文件的固定行为(push 选中全部范围、未匹配的路径选中全部范围、gate 对每种结果的判定),副本里改一处,资产的测试照样绿,这份保证却已不成立。
- 项目需要不同的固定行为时,必须先改本 skill 的资产,并在 `ci-routing.test.mjs` 里加一个改坏它就会红的用例,再把资产重新复制进项目。

### job 与 routing.json 对齐

每次新建或改动门禁 workflow 或 `routing.json`,必须枚举 workflow 的全部 job id,逐个按下表核对,任一项不符即违反:

| job | 必须满足 |
|---|---|
| `changes` | id 就是 `changes`;没有 `if`;checkout 写 `fetch-depth: 0` 与 `persist-credentials: false`;`outputs` 里每个范围一行,且与 `routing.json` 的范围一一对应 |
| 产品 job | `needs` 含 `changes`;`if` 只在它所在的范围被选中时为真(在两个范围里的,两个范围用 `\|\|` 连接);id 写在 `routing.json` 这些范围的 job 列表里 |
| 其余 job(仓库规范检查等) | 没有 `if`;不在 `routing.json` 的任何范围里——gate 对它们一律要求成功 |
| `ci-gate` | `name` 是 `CI gate`;`needs` 等于其余全部 job id 的集合——gate 只看得见自己 `needs` 里的 job,漏掉的那个失败了 PR 照样能合;`if: ${{ always() }}`,不得写成 `!cancelled()` 或省略——上游失败或跳过时那两种写法会让 gate 被跳过,而被跳过的必需检查算作通过;取结果的 step 带 `NEEDS_JSON: ${{ toJSON(needs) }}` |
| 每个 job 与 step | 没有 `continue-on-error`;除失败时上传报告的 step 外,step 没有 `if` |

- 仓库的依赖里已有 YAML 解析器的,必须把这张表写成一个读取门禁 workflow 的测试,放进 `.github/ci/`;没有的,每次改动后按表人工核对。

### 写 routing.json

- 规则取第一条命中的,所以必须依次写:跨产品的输入——共享输入(根依赖与锁文件、lint 与类型检查的共用配置、共用的测试工具,选中全部范围)与下面枚举出的跨产品读取——、只被仓库规范检查读取的文档、各产品自己的目录。
- 文档规则只得列出没有任何产品的构建、测试或检查会读取的路径;不得写 `**/*.md` 或整个 `docs/**` 这类按扩展名或按目录整体豁免的模式:产品目录里的 Markdown 可以是界面内容或 fixture,`docs/` 下可以有被检查脚本读取的原型。**判据**:对每条文档模式,在各产品的代码、测试与构建配置里检索它第一个 `*` 之前的部分(没有 `*` 的检索整条模式),无命中才可列为文档。
- 写各产品的规则前,必须枚举跨产品读取:对每个产品,在它的代码、测试与构建配置里检索指向其他产品目录的路径——其他产品的目录名字面量,与越出本产品根目录的相对路径(`../`)各检索一次;命中的每个被读文件,都写进跨产品的输入里一条同时选中读写两方范围的规则。不做这次检索,一个改动经由这类文件弄坏另一个产品时,PR 上那个产品的检查不会运行,要到合并后默认分支的 run 才会红。
- `routing-rules.test.mjs` 必须为 `routing.json` 的每个模式写至少一行用例:路径取自仓库实际跟踪的文件,期望的范围写成字面量;模板最后那条「每个模式都被某行用例命中」的断言不得删。

### 首次上线

上线时必须从下列三次 run 各读出并核对;任一项不符的,必须修好门禁,并在下一次同类 run 上重新核对该项:

| run | 核对 |
|---|---|
| 引入门禁的 PR(它改了 `.github/`,所以选中全部范围) | 全部产品 job 都运行了;`CI gate` 成功;按 §4「check 名从哪来」的命令读出的名字就是 `CI gate` |
| 该 PR 合并后默认分支的 push | `Changed scopes` 打印出 push 的原因行;全部产品 job 都运行了 |
| 此后第一个没有选中全部范围的 PR | `Changed scopes` 打印的范围与 `routing-rules.test.mjs` 对这些路径的预期一致;未选中的产品 job 显示为跳过,而不是失败或未出现;`CI gate` 成功 |

## 3. 门禁必须证明「能红」

**一道从未失败过的门禁,与没有门禁,在证据上等价。** 新建或改动门禁后做一次变异验证。

方法按门禁能不能在本地跑分路:

- **本地能完整跑通的**(脚本门禁、lint、语言/文案检查)→ **先本地变异**:改入反例、跑门禁、直接捕获退出码(不经管道)、还原。几秒出结论,不占 CI。
- **只有 CI 环境才能复现的**(runner 的 node 版本、secrets 注入、矩阵构建、分支保护本身)→ 开一个一次性 PR,标题与正文写明「不合并」,推入故意的错误,看 CI 变红;验完**关闭 PR 并删分支,绝不合并**。

设计变异时的两条要求,对两种路径同样成立:

1. **打不同的步骤**,证明每一步都在独立判定,而不是"整体挂了"。
2. **每次变异都预先写下预期红在哪一步**,再核对实际失败步骤与错误信息是否一致。对不上说明门禁的行为与理解不符,要查清楚。

一组有效的变异:

| 变异 | 预期 | 证明了什么 |
|---|---|---|
| 破坏一处**只有测试能抓住**的地方(如某子包的断言,而根 typecheck 的 include 不覆盖该子包) | Typecheck 通过、**Test 红** | 该子包的测试确实进了 CI,不只是本地摆设 |
| 还原上一处,在 typecheck 覆盖的路径里制造类型错误 | **Typecheck 红**,Test 根本不执行 | 门禁在更早的步骤就能拦住,失败定位准确 |

佐证信号:两次 run 的**失败步骤不同**,且**耗时明显不同**(早失败的 run 短得多),与 workflow 里的步骤顺序一致。

查失败详情:
```bash
gh run view <run-id> --log-failed | grep -E "error|FAIL|Process completed" | head
```

## 4. GitHub 侧配置(Rulesets)

新版走 Settings → Rules → Rulesets;旧版 Branch protection 与之二选一,不要同时配。

### 必备三项(缺一则整条规则不生效)

1. **Enforcement status = Active**。新建出来默认是 Disabled,不改的话所有规则都是摆设。
2. **Target branches 包含默认分支**(`~DEFAULT_BRANCH` 或显式分支名)。留空则不匹配任何分支。
3. **Require status checks to pass**,并添加 `CI gate`(§2「必需检查只登记 gate」)。

### check 名从哪来

required status check 的 context 取 job 的 `name` 字段;未设 `name` 时取 **job id**。骨架里 gate 的 `name` 是 `CI gate`,context 就是 `CI gate`。

确认实际登记的名字(而不是猜):
<!-- example -->
```bash
gh api "repos/<owner>/<repo>/commits/<sha>/check-runs" \
  --jq '.check_runs[] | "\(.name)  来源=\(.app.slug)"'
```

**不选部署类检查。** 下拉里会同时出现部署类检查(Cloudflare Pages、Vercel 等)。把部署检查设为必需的后果:不触及被部署目录的 PR 因为它从不运行,会永久卡在「等待检查」而合不了。

### 改必需检查的名字

必须依次:让新名字在一次 run 里报出成功;改线上规则,并按下面「核验实际生效的配置」读回;最后才删旧 job。先删旧 job,所有 PR 卡在等待它;先改规则而新名字还没报过,同样卡住。

### 两个附加选项的取舍

**Require branches to be up to date before merging**(API: `strict_required_status_checks_policy`)

抓的是**语义冲突**:两个 PR 各自绿、合到一起坏,且没有文本冲突所以 git 不拦。

代价是合并串行化:每合一个 PR,其余所有 PR 立刻作废,需逐个 Update branch + 重跑检查。同时开着 N 个 PR 时,合完要等 N 轮。

- 单人仓库、PR 当天开当天合 → **关**。兜底是门禁同时挂在默认分支的 push 上,且 push 选中全部范围(§2),语义冲突在合并后的那次 run 里暴露,修正向前推进即可;此时默认分支坏掉的爆炸半径要评估(发版需推 tag 触发的,坏在分支上不影响已发布产物;托管平台构建失败通常保留上一次成功的部署)。
- 多人协作,或存在跨天的长命 PR → **开**。

**Do not require status checks on creation**(API: `do_not_enforce_on_create`)

**开**。只作用于默认分支时它是空操作;一旦以后把 target 扩到 `refs/heads/**` 之类,不开会导致新分支根本推不上去,而这个症状与门禁的关系不直观,排查很费时间。

**Bypass actors**

留空。加了等于给门禁开后门,而最需要被检查的往往正是"我确信没问题所以想绕过"的那次提交。

### 核验实际生效的配置

UI 上勾了不等于存成功。用 API 读:

<!-- example -->
```bash
# 列出全部(注意:list 接口不返回 conditions,只能看 id/name/enforcement)
gh api repos/<owner>/<repo>/rulesets \
  --jq '.[] | "id=\(.id) name=\(.name) enforcement=\(.enforcement)"'

# 逐个取详情
gh api repos/<owner>/<repo>/rulesets/<id> --jq '{
  enforcement,
  include: .conditions.ref_name.include,
  bypass: [.bypass_actors[]?],
  rules: [.rules[].type],
  checks: [.rules[] | select(.type=="required_status_checks") | .parameters.required_status_checks[].context]
}'
```

四项全部对上才算配好:`enforcement=active`、`include` 非空、`rules` 含 `required_status_checks`、`checks` 恰好是 §2「必需检查只登记 gate」规定登记的那几条。

**多条 ruleset 并存时逐个查**。`enforcement=disabled` 且 `include=[]` 的是建了没配完的残留,删除前先确认它的规则集是现存规则的子集:

<!-- example -->
```bash
gh api repos/<owner>/<repo>/rulesets/<旧id> --jq '[.rules[].type]|sort'
gh api repos/<owner>/<repo>/rulesets/<新id> --jq '[.rules[].type]|sort'
# 旧 ⊆ 新,且旧的 bypass_actors 为空,才可删
gh api repos/<owner>/<repo>/rulesets/<旧id> > /tmp/ruleset-backup.json   # 先备份
gh api -X DELETE repos/<owner>/<repo>/rulesets/<旧id>
```

## 5. 门禁对发版流程的影响

required status checks 生效后,**向默认分支的直接推送会被拒**:被推的 commit 需要先在别的 ref 上跑绿过检查,而本地新建的提交没有。服务端返回的原话:

```
remote: error: GH013: Repository rule violations found for refs/heads/master.
remote: - Required status check "checks" is expected.
 ! [remote rejected] <branch> -> master (push declined due to repository rule violations)
```

所以发版时改 version 的 commit 按 [release.md](release.md)「标准发版流程」第 3 步走 PR。

不受影响的:**tag 推送**。ruleset 的 target 是 branch,`git push origin v1.2.0` 照常触发发版 workflow。

不要为此加 bypass actor——那会让门禁恰好在发版这类最不该出错的提交上失效。
