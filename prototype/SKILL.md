---
name: prototype
description: 造一次性原型回答设计问题。逻辑/状态模型对不对 → 终端驾驶 + mermaid 状态图;界面长什么样 → 文字选型后生成单个自包含 HTML。用户要验证状态机/数据模型/API 手感,或探索 UI 方案时激活。
---

> Fork 自 mattpocock/skills(2026-07 快照)。修改:①原型统一放 docs/prototypes/<功能模块>/,不入 src;②Logic 原型必产 mermaid 状态图(README 三合一);③UI 原型改为"文字选型在前+单变体自包含 HTML(零后端)",取代项目内路由与多变体预生成方案。

# Prototype

原型是**回答一个问题的一次性代码——问题决定形态**:

- **"这个逻辑/状态模型对吗?"** → [LOGIC.md](./LOGIC.md):纯逻辑模块 + 终端驾驶壳 + mermaid 状态图。
- **"这个界面该长什么样?"** → [UI.md](./UI.md):文字选型 → 用户选定 → 单个自包含 HTML。

形态选错整个原型作废。问题真含糊且用户不在场:后端模块倾向 logic、页面/组件倾向 UI,并在 README 顶部写明假设。

## 通用规则

1. **位置与命名**:统一放 `docs/prototypes/<功能模块>/`(模块名对齐 docs/features/ 的 slug 或 CONTEXT.md 术语簇;新功能用其 feature-slug)。**不进 src/**。README/文件头写明原型化的目标功能与问题,补足上下文。
2. **一条命令可跑**:logic 接入项目既有 task runner;HTML 双击/浏览器直开。
3. **默认零持久化**:状态只在内存——持久化是原型要检验的对象,不是它可依赖的东西。
4. **跳过打磨**:无测试、无错误处理(仅保可跑)、无抽象、无泛化("将来支持 X"禁止)。
5. **状态外显**:每次动作(logic)/每次切换(UI)后,渲染完整相关状态。
6. **用后捕获**:答案(裁决+它解决的问题)记入 issue/commit;验证过的决策折进真代码/spec/ADR(mermaid 图按 to-spec 豁免条款可直接内联);原型目录整体提交到 main 之外的一次性分支并留指针;**main 只留验证过的决策,docs/prototypes/ 随之清空**(画廊基建 index.html/manifest.js 保留,条目清空)。

## 画廊(Figma 式浏览全部原型)

`docs/prototypes/index.html` = 画廊壳:左侧固定侧栏(按模块分组的原型列表,可收起) + 右侧屏幕(UI 条目 iframe 渲染;Logic 条目信息卡:问题/运行命令/README 路径)。hash 路由可分享,↑/↓ 键切换。

- **懒创建**:首次生成原型时,若壳不存在,从本 skill 目录的 [gallery-template.html](./gallery-template.html) **原样复制**为 `docs/prototypes/index.html`,并创建空注册表 `manifest.js`。壳在项目里不手改——要改壳,改 skill 模板后重新复制。
- **注册表同步(硬规则)**:每生成一个原型,往 `manifest.js` 的 `window.PROTOTYPES` 追加一条 `{module, type:'ui'|'logic', id, name, path, question, run?}`;删除原型同步删条目——注册表腐烂等于画廊失明。
- 技术约束的由来:注册表用 .js 不用 .json(file:// 下 fetch JSON 被 CORS 拦,script 标签不受限);右屏用 iframe 不用内容注入(隔离各原型的 CSS/JS)。
