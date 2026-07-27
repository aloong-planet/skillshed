---
name: prototype
description: 造原型回答设计问题。逻辑/状态模型对不对 → 浏览器驾驶面板 + mermaid 状态图;界面长什么样 → 文字选型后生成单个自包含 HTML。产物留在 docs/prototypes/ 作模型活文档。用户要验证状态机/数据模型/API 手感,或探索 UI 方案时激活。
---

> Fork 自 mattpocock/skills(2026-07 快照)。修改:①原型统一放 docs/prototypes/<功能模块>/,不入 src;②Logic 原型必产 mermaid 状态图(README 三合一);③UI 原型改为"文字选型在前+单变体自包含 HTML(零后端)",取代项目内路由与多变体预生成方案。

# Prototype

原型是**回答一个问题的代码——问题决定形态**。代码本身是原型级的(不加测试、不泛化、**不直接晋升产线**),但**产物保留**作模型的活文档(见通用规则 6/7):

- **"这个逻辑/状态模型对吗?"** → [LOGIC.md](./LOGIC.md):纯逻辑模块 + 浏览器驾驶面板 + mermaid 状态图。
- **"这个界面该长什么样?"** → [UI.md](./UI.md):文字选型 → 用户选定 → 单个自包含 HTML。

形态选错整个原型作废。问题真含糊且用户不在场:后端模块倾向 logic、页面/组件倾向 UI,并在原型页顶部写明假设。

## 本 skill 的文件

| 文件 | 用途 |
|---|---|
| [LOGIC.md](./LOGIC.md) | Logic 分支:产物结构、流程、反模式 |
| [STATE-MACHINE.md](./STATE-MACHINE.md) | 状态机建模约定 + 驾驶面板规范 + 实现约束(横切,真代码同样适用) |
| [UI.md](./UI.md) | UI 分支:文字选型 → 单变体 HTML |
| [MMD-STYLES.md](./MMD-STYLES.md) | mermaid 配色预设与写法约定(时序图/状态图) |
| [logic-template.js](./logic-template.js) | 逻辑模块骨架(initial/reduce/legal/TERMINAL + JSDoc) |
| [logic-page-template.html](./logic-page-template.html) | Logic 原型页模板(图渲染 + 驾驶面板 + 画布交互) |
| [gallery-template.html](./gallery-template.html) | 画廊壳模板 |
| [sync-mmd.mjs](./sync-mmd.mjs) | `.mmd` → `model.mmd.js` 生成期同步脚本 |

模板类资产**正本在此**,项目里的是复制实例——要改行为,改这里再重新复制,不手改实例。

## 通用规则

1. **位置与命名**:统一放 `docs/prototypes/<功能模块>/`(模块名对齐 docs/features/ 的 slug 或 CONTEXT.md 术语簇;新功能用其 feature-slug)。**不进 src/**。README/文件头写明原型化的目标功能与问题,补足上下文。
2. **一条命令可跑**:logic 接入项目既有 task runner;HTML 双击/浏览器直开。
3. **默认零持久化**:状态只在内存——持久化是原型要检验的对象,不是它可依赖的东西。
4. **跳过打磨**:无测试、无错误处理(仅保可跑)、无抽象、无泛化("将来支持 X"禁止)。
5. **状态外显**:每次动作(logic)/每次切换(UI)后,渲染完整相关状态。
6. **用后捕获,原型保留**:答案(裁决+它解决的问题)记入 issue/commit;验证过的**决策**折进真代码/spec/ADR(mermaid 图按 to-spec 豁免条款可直接内联);验证过的逻辑模块提升进真代码。**原型本身是持久资产,留在 `docs/prototypes/` 不清空**——状态机图 + 可驾驶面板是模型的活文档,清掉等于每次重造。
7. **防腐烂(原型持久化的代价,必须付)**:原型描述**模型**(状态/迁移/准入条件),**不写实现细节**(文件路径、字段名、函数签名)——与 CONTEXT.md 同规矩,不含易腐内容。模型演化时同步改 `.mmd` 与逻辑模块并重跑 sync-mmd.mjs;做不到就在原型页问题段标注「已失效:模型已演进,见 <出处>」——**失效标注优于静默腐烂**。对应功能被移除时,连同原型目录与 manifest 条目一并删除。

## 画廊(Figma 式浏览全部原型)

`docs/prototypes/index.html` = 画廊壳:左侧 Figma 式深色工具侧栏(按模块分组,可收起,快捷键 S) + 右侧屏幕。**一切条目统一 iframe**——UI 是自包含 HTML,Logic 也是自渲染页(问题/图/命令都在页内),壳不做任何内容渲染。hash 路由可分享,↑/↓ 键切换。

- **懒创建**:首次生成原型时铺齐画廊基建——从本 skill 目录复制 [gallery-template.html](./gallery-template.html) → `docs/prototypes/index.html`、[sync-mmd.mjs](./sync-mmd.mjs) → `docs/prototypes/sync-mmd.mjs`,创建空注册表 `manifest.js`,并**懒下载渲染库** `vendor/mermaid.min.js`(`curl -sL -o docs/prototypes/vendor/mermaid.min.js https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js`,约 3.4MB,一次下载后离线可用;缺失时 Logic 页自动降级为显示图源文本)。基建在项目里不手改——要改,改 skill 正本后重新复制。
- **注册表同步(硬规则)**:每生成一个原型,往 `manifest.js` 的 `window.PROTOTYPES` 追加一条 `{module, type:'ui'|'logic', id, name, path}`;删除原型同步删条目——注册表腐烂等于画廊失明。
- 技术约束的由来:注册表与图源经 .js 包装、且 .mmd→model.mmd.js 走**生成期**同步脚本(file:// 下运行时 fetch 本地文件被 CORS 拦,script 标签不受限);右屏统一 iframe(隔离各原型的 CSS/JS);渲染库 vendor 本地化不用 CDN 引用(离线可用,保自包含)。
