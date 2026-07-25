# Logic 原型

终端交互驾驶舱:用户亲手驱动状态模型。适用于业务逻辑/状态迁移/数据形状——纸面看着合理、推真实用例才露馅的问题。("长什么样"→ [UI.md](./UI.md))

## 产物结构(不使用 README.md)

```
docs/prototypes/<功能模块>/<原型名>/
├── index.html     ← 原型页:问题段落 + mermaid 图渲染 + 运行命令(从 logic-page-template.html 复制填充)
├── <图名>.mmd     ← mermaid 图源(单一正本,一图一文件,首行 `%% title: 标题`;IDE 可直接预览)
├── model.mmd.js   ← 派生文件:sync-mmd.mjs 从 *.mmd 生成,勿手改
├── logic.ts       ← 纯逻辑模块(验证后可整体提升进真代码)
└── tui.ts         ← 一次性驾驶壳
```

## 流程

1. **写下问题 + 画出模型**:①问题段落与运行命令写进 `index.html`(复制 [logic-page-template.html](./logic-page-template.html) 替换 `{{NAME}}/{{QUESTION}}/{{RUN}}/{{KEYS}}` 占位);②**mermaid 图写 `.mmd` 文件**(一图一文件,首行 `%% title: 标题`;状态机用 `stateDiagram-v2`:状态/迁移/触发动作;reducer 的 action 即迁移标签;纯函数集用 flowchart 画数据变换;时序图按 [MMD-STYLES.md](./MMD-STYLES.md) 预设与写法约定,init 块拷入文件首);③跑 `node docs/prototypes/sync-mmd.mjs` 生成 model.mmd.js;④预览走画廊(该页被 iframe 渲染;图为可交互画布——拖拽平移、捏合或 ⌘/Ctrl+滚轮平滑缩放、双击或 ⌂ 重置,普通滚轮归页面滚动,行为随模板自带)。
2. **选语言**:随宿主项目;不为原型引入新运行时/包管理器。
3. **逻辑隔离在可移植纯接口后**,按问题选形态(不按好接 TUI 选):纯 reducer `(state, action) => state` / 显式状态机(当"哪些动作现在合法"本身是问题时) / 纯函数集 / 带内部状态的类。零 I/O、零终端码、零 console.log 控制流;TUI 单向依赖它。这层分离是原型的遗产机制——验证过的模块可整体提升。
4. **最小 TUI**:每帧清屏整帧重绘(不追加滚动,永远一个稳定视图);帧 = 当前状态美观打印(一行一字段或格式化 JSON,ANSI 粗体字段名、暗色次要信息)+ 底部键位表 `[a] 加用户  [q] 退出`;读一键 → dispatch → 整帧重绘;全帧一屏放下。
5. **一条命令可跑**:接入 package.json scripts 等既有 task runner;没有就把命令写在 README 顶部。
6. **交给用户驾驶**:有价值的时刻是"等等,这不该可能"——那是想法里的 bug,正是原型的意义。要加动作就加,原型会进化;**模型演化了,改 `.mmd` 并重跑 sync-mmd.mjs**——图与代码不一致即腐烂,过期的图比没有图危险。
7. **捕获**:答案记入 issue/commit;验证过的逻辑模块提升进真代码;mermaid 图(取自 .mmd 正本)内联进 spec 或作 ADR 来源;原型目录整体上一次性分支。

## 反模式

- 不加测试(需要测试的原型不是原型)
- 不接真实数据库(除非问题就是持久化)
- 不泛化
- 逻辑与 TUI 不许糊在一起(reducer 里出现终端码即不可移植)
- TUI 壳不许进产线(值得留的是它背后的逻辑模块)
