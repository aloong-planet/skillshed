---
name: prototype
description: 造一次性原型回答设计问题。逻辑/状态模型对不对 → 终端驾驶 + mermaid 状态图;界面长什么样 → 免构建的自包含 HTML 变体。用户要验证状态机/数据模型/API 手感,或探索 UI 方案时激活。
---

> Fork 自 mattpocock/skills(2026-07 快照)。修改:①原型统一放 docs/prototypes/<功能模块>/,不入 src;②Logic 原型必产 mermaid 状态图(README 三合一);③UI 原型改为自包含 HTML(零后端+必要交互+内建切换条),取代项目内路由方案。

# Prototype

原型是**回答一个问题的一次性代码——问题决定形态**:

- **"这个逻辑/状态模型对吗?"** → [LOGIC.md](./LOGIC.md):纯逻辑模块 + 终端驾驶壳 + mermaid 状态图。
- **"这个界面该长什么样?"** → [UI.md](./UI.md):自包含 HTML,多变体内建切换。

形态选错整个原型作废。问题真含糊且用户不在场:后端模块倾向 logic、页面/组件倾向 UI,并在 README 顶部写明假设。

## 通用规则

1. **位置与命名**:统一放 `docs/prototypes/<功能模块>/`(模块名对齐 docs/features/ 的 slug 或 CONTEXT.md 术语簇;新功能用其 feature-slug)。**不进 src/**。README/文件头写明原型化的目标功能与问题,补足上下文。
2. **一条命令可跑**:logic 接入项目既有 task runner;HTML 双击/浏览器直开。
3. **默认零持久化**:状态只在内存——持久化是原型要检验的对象,不是它可依赖的东西。
4. **跳过打磨**:无测试、无错误处理(仅保可跑)、无抽象、无泛化("将来支持 X"禁止)。
5. **状态外显**:每次动作(logic)/每次切换(UI)后,渲染完整相关状态。
6. **用后捕获**:答案(裁决+它解决的问题)记入 issue/commit;验证过的决策折进真代码/spec/ADR(mermaid 图按 to-spec 豁免条款可直接内联);原型目录整体提交到 main 之外的一次性分支并留指针;**main 只留验证过的决策,docs/prototypes/ 随之清空**。
