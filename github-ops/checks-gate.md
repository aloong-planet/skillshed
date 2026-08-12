# CI 检查门禁与分支保护

门禁 = 一个在 PR 与默认分支 push 上跑的检查 workflow + 一条把它设为必需的分支规则。
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

```yaml
name: Checks

on:
  pull_request:
  push:
    branches:
      - master          # 默认分支名按仓库实际填

concurrency:
  group: checks-${{ github.ref }}
  cancel-in-progress: true

jobs:
  checks:               # 这个 id 就是 required status check 的名字(见下)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # pnpm 必须在 setup-node 之前:setup-node 的 cache: 'pnpm' 会调用 pnpm 探测 store 路径
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22        # 不要照抄其它 workflow 的版本,见「Node 版本」
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build

      # 子包若有独立 lockfile / node_modules(不在 workspace 里),必须单独 install
      - run: pnpm install --frozen-lockfile
        working-directory: <子包目录>
      - run: pnpm build
        working-directory: <子包目录>
```

### Node 版本:不能沿用打包 workflow 的版本

打包 job 与检查 job 对 node 的需求不同,同一个版本号在前者能过、在后者会炸:

- 打包时 runner 的 node 只用于跑构建工具;**产物里跑的是运行时自带的 node**(Electron 等),与 runner 无关。
- 检查时测试**直接在 runner 的 node 上执行**,项目用到的内置模块必须由它提供。

典型触发点:`node:sqlite` 需 Node ≥ 22.5、`node:test` 的部分 API、原生 fetch/WebSocket 的版本差异。判据是**CI 的 node 版本不低于本地开发用的版本**,而不是"复制隔壁 workflow"。

排查方式:
```bash
node -v                                    # 本地
grep -rln "node:sqlite\|node:test" src/    # 项目用到的版本敏感内置模块
```

### 各步骤落地前先本地按 CI 的顺序实跑一遍

包括两次 `--frozen-lockfile` 的 install。lockfile 不同步、子包依赖没装、脚本名拼错这类问题,本地一次就能暴露,不必等 CI 排队。

## 2. 门禁必须证明「能红」

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

## 3. GitHub 侧配置(Rulesets)

新版走 Settings → Rules → Rulesets;旧版 Branch protection 与之二选一,不要同时配。

### 必备三项(缺一则整条规则不生效)

1. **Enforcement status = Active**。新建出来默认是 Disabled,不改的话所有规则都是摆设。
2. **Target branches 包含默认分支**(`~DEFAULT_BRANCH` 或显式分支名)。留空则不匹配任何分支。
3. **Require status checks to pass**,并添加门禁的 check 名。

### check 名从哪来

required status check 的 context 取 job 的 `name` 字段;未设 `name` 时取 **job id**。上面骨架里 job id 是 `checks`,则 context 就是 `checks`。

确认实际登记的名字(而不是猜):
```bash
gh api "repos/<owner>/<repo>/commits/<sha>/check-runs" \
  --jq '.check_runs[] | "\(.name)  来源=\(.app.slug)"'
```

**只选质量门禁那一条。** 下拉里会同时出现部署类检查(Cloudflare Pages、Vercel 等)。把部署检查设为必需的后果:不触及被部署目录的 PR 因为它从不运行,会永久卡在「等待检查」而合不了。

### 两个附加选项的取舍

**Require branches to be up to date before merging**(API: `strict_required_status_checks_policy`)

抓的是**语义冲突**:两个 PR 各自绿、合到一起坏,且没有文本冲突所以 git 不拦。

代价是合并串行化:每合一个 PR,其余所有 PR 立刻作废,需逐个 Update branch + 重跑检查。同时开着 N 个 PR 时,合完要等 N 轮。

- 单人仓库、PR 当天开当天合 → **关**。兜底是门禁同时挂在默认分支的 push 上,语义冲突在合并后一分钟内暴露,修正向前推进即可;此时默认分支坏掉的爆炸半径要评估(发版需推 tag 触发的,坏在分支上不影响已发布产物;托管平台构建失败通常保留上一次成功的部署)。
- 多人协作,或存在跨天的长命 PR → **开**。

**Do not require status checks on creation**(API: `do_not_enforce_on_create`)

**开**。只作用于默认分支时它是空操作;一旦以后把 target 扩到 `refs/heads/**` 之类,不开会导致新分支根本推不上去,而这个症状与门禁的关系不直观,排查很费时间。

**Bypass actors**

留空。加了等于给门禁开后门,而最需要被检查的往往正是"我确信没问题所以想绕过"的那次提交。

### 核验实际生效的配置

UI 上勾了不等于存成功。用 API 读:

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

四项全部对上才算配好:`enforcement=active`、`include` 非空、`rules` 含 `required_status_checks`、`checks` 是门禁那条。

**多条 ruleset 并存时逐个查**。`enforcement=disabled` 且 `include=[]` 的是建了没配完的残留,删除前先确认它的规则集是现存规则的子集:

```bash
gh api repos/<owner>/<repo>/rulesets/<旧id> --jq '[.rules[].type]|sort'
gh api repos/<owner>/<repo>/rulesets/<新id> --jq '[.rules[].type]|sort'
# 旧 ⊆ 新,且旧的 bypass_actors 为空,才可删
gh api repos/<owner>/<repo>/rulesets/<旧id> > /tmp/ruleset-backup.json   # 先备份
gh api -X DELETE repos/<owner>/<repo>/rulesets/<旧id>
```

## 4. 门禁对发版流程的影响

required status checks 生效后,**向默认分支的直接推送会被拒**:被推的 commit 需要先在别的 ref 上跑绿过检查,而本地新建的提交没有。服务端返回的原话:

```
remote: error: GH013: Repository rule violations found for refs/heads/master.
remote: - Required status check "checks" is expected.
 ! [remote rejected] <branch> -> master (push declined due to repository rule violations)
```

这改变 SKILL.md §3 标准发版流程的第 1–3 步:**改 version 的 commit 不能直推默认分支,必须走 PR**。

不受影响的:**tag 推送**。ruleset 的 target 是 branch,`git push origin v1.2.0` 照常触发发版 workflow。

不要为此加 bypass actor——那会让门禁恰好在发版这类最不该出错的提交上失效。
