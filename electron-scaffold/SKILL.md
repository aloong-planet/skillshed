---
name: electron-scaffold
description: "初始化 Electron(electron-builder)新项目时该铺的一次性基础设施清单。当新建/搭建 Electron 桌面应用、配置 electron-builder 打包、或用户提到'初始化 Electron 项目 / 建基础设施 / 打包脚手架'时激活。当前收录:打包产物版本保留(自动清理旧 release)。"
when_to_use: "初始化一个新的 Electron + electron-builder 项目时(一次性铺基础设施)。不是每次打包/发版都用——发版规范见 github-ops。"
---

# Electron 新项目基础设施(scaffold)

初始化 Electron(electron-builder)新项目时**一次性**铺的基础设施。这些是"建项目时装一次、以后自动生效"的东西,不是日常操作。日常发版/打包规范另见 `github-ops` skill。

> 用法:新建 Electron 项目做初始化时,过一遍下面的清单,把适用项装进去。每项都有:何时需要、装什么、怎么接、验证。

---

## 1. 打包产物版本保留(自动清理旧 release)

**何时需要**:`electron-builder.yml` 的 `directories.output` 用了 `release/${version}`(每版一个子目录)。electron-builder **无内置版本保留配置**(实测 26.x options schema 无 keep/retain/prune),只写不删 → 版本无限累积吃磁盘(实际见过 21 版 8.3G)。

**装什么**:把本 skill 的 `assets/clean-old-releases.cjs` 复制到项目 `build/` 目录(与 `buildResources: build` 同处)。脚本通用无项目硬编码,靠 `BuildResult.outDir` 定位版本根、按 semver 排序、保留最近 N 个(默认 5,`KEEP_RELEASES` env 可覆盖)。

```bash
cp ~/.claude/skills/electron-scaffold/assets/clean-old-releases.cjs <项目>/build/
```

**怎么接**:`electron-builder.yml` 顶层加 afterAllArtifactBuild 钩子:
```yaml
afterAllArtifactBuild: build/clean-old-releases.cjs
```

**⚠️ 关键坑**:
- **`.cjs` 后缀必需**——若 `package.json` 是 `"type": "module"`,普通 `.js` 会被当 ESM,脚本里的 `require`/`module.exports` 报 `require is not defined in ES module scope`。electron-builder 用 dynamic `import()` 加载钩子,`.cjs` 对"手动 node 运行"和"electron-builder 加载"都兼容。
- 钩子路径写成 `build/xxx.cjs`(相对项目根),electron-builder 会 resolve 到工作区内;不能指向工作区外。

**验证**(装完跑一遍):
```bash
# 手动清一次现有产物 + 验证幂等(再跑应"无需清理",不误删保留项)
node build/clean-old-releases.cjs        # 首次:打印删除清单
node build/clean-old-releases.cjs        # 再跑:无需清理(版本数 ≤ N)
KEEP_RELEASES=3 node build/clean-old-releases.cjs   # 参数化生效验证(干跑前先确认清单)
```
成功标准:版本目录裁到最近 N 个;非版本散文件(latest-mac.yml / *.blockmap)不被碰;再跑幂等不越删越少。

**设计要点**(脚本已实现,复用时无需改):
- 严格 semver 正则识别版本目录 → **绝不误删**非版本内容。
- semver 数值比较(非字符串)→ 正确处理 `0.10 vs 0.9`。
- 删除失败只 `console.warn` 不抛 → **清理不拖垮打包**(附加动作失败不该让发版失败)。
- CI 上 fresh runner 每次只有 1 版,钩子无害(版本数 ≤ N 不删)。
- **不静默**:删了哪些会打印清单。

**注意**:`release/`(或你的 output 根)应在 `.gitignore` —— 清理的是本地产物,不影响 git、不影响云端 GitHub Release。

---

<!--
扩展位:以后 Electron 新项目基础设施的其它一次性项(如无签名 CI 打包坑、多架构产物命名、
graceful-quit 骨架等)可在此追加为 ## 2 / ## 3 ……。每项保持"何时需要 / 装什么 / 怎么接 / 验证"结构。
-->
