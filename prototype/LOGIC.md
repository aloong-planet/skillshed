# Logic 原型

浏览器驾驶面板:点按钮驱动状态模型,状态与图同页。适用于业务逻辑/状态迁移/数据形状——纸面看着合理、推真实用例才露馅的问题。("长什么样"→ [UI.md](./UI.md))

建模约定、面板规范与实现约束见 [STATE-MACHINE.md](./STATE-MACHINE.md);图的配色与写法见 [MMD-STYLES.md](./MMD-STYLES.md)。

## 产物结构(不使用 README.md)

```
docs/prototypes/<功能模块>/<原型名>/
├── index.html     ← 原型页:问题段落 + mermaid 图 + 驾驶面板(从 logic-page-template.html 复制填充)
├── <图名>.mmd     ← mermaid 图源(单一正本,一图一文件,首行 `%% title: 标题`;IDE 可直接预览)
├── model.mmd.js   ← 派生文件:sync-mmd.mjs 从 *.mmd 生成,勿手改
└── logic.js       ← 纯逻辑模块(从 logic-template.js 复制填充;验证后可整体提升进真代码)
```

## 流程

1. **写下问题 + 画出模型**:①问题段落写进 `index.html`(复制 [logic-page-template.html](./logic-page-template.html) 替换占位);②**mermaid 图写 `.mmd` 文件**(一图一文件,首行 `%% title: 标题`;状态机用 `stateDiagram-v2`:状态/迁移/触发动作;reducer 的 action 即迁移标签;纯函数集用 flowchart 画数据变换;预设与写法约定见 MMD-STYLES.md,init 块拷入文件首);③跑 `node docs/prototypes/sync-mmd.mjs` 生成 model.mmd.js;④预览走画廊(该页被 iframe 渲染;图为可交互画布——拖拽平移、捏合或 ⌘/Ctrl+滚轮平滑缩放、双击或 ⌂ 重置,普通滚轮归页面滚动,行为随模板自带)。
2. **写逻辑模块**:复制 [logic-template.js](./logic-template.js) 填充 `initial`/`reduce`/`legal`/`ALL_ACTIONS`/`TERMINAL`。规则只写在 `reduce` 里,`legal` 是它的派生查询(见 STATE-MACHINE.md)。
3. **接驾驶面板**:按钮从 `legal(state)` 派生置灰、回执栏三态、清空回空态——规范与两个实现约束(aria-disabled、不用 opacity)见 STATE-MACHINE.md。
4. **交给用户驾驶**:有价值的时刻是"等等,这不该可能"——那是想法里的 bug,正是原型的意义。要加事件就加,原型会进化;**模型演化了,改 `.mmd` 并重跑 sync-mmd.mjs**——图与代码不一致即腐烂,过期的图比没有图危险。
5. **捕获**:答案记入 issue/commit;验证过的逻辑模块提升进真代码(`legal()` 常常连带暴露产线里"准入条件散在 UI 条件渲染"的重构机会);mermaid 图(取自 .mmd 正本)内联进 spec 或作 ADR 来源;原型目录整体上一次性分支。

## 反模式

- 不加测试(需要测试的原型不是原型)
- 不接真实数据库(除非问题就是持久化)
- 不泛化
- 逻辑与面板不许糊在一起(reducer 里出现 DOM 即不可移植)
- **准入条件不许在面板里重写一遍**(那是同一份规则的第二份拷贝,必然腐烂)——从 `legal()` 派生
- 面板壳不许进产线(值得留的是它背后的逻辑模块)
