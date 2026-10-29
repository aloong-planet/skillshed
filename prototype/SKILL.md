---
name: prototype
description: 用一次性原型回答拿不准的设计问题,产物留在 docs/prototypes/ 作模型的活文档。用户要验证状态机、数据模型、API 手感,或探索界面方案时激活;凡改动含用户可见的界面变化(含改色、调间距这类视觉微调),动手写实现代码前必经此关。
---

> Fork 自 mattpocock/skills(2026-07 快照)。与上游的差异:原型统一放 `docs/prototypes/<功能模块>/` 而不入 src;Logic 原型必产 mermaid 状态图;UI 原型走"文字选型在前 + 单变体自包含 HTML(零后端)",而非项目内路由与多变体预生成。

# Prototype

原型是**回答一个问题的代码——问题决定形态**。代码本身是原型级的(不加测试、不泛化、**不直接晋升产线**),但**产物保留**作模型的活文档(见通用规则 6/7):

- **"这个逻辑/状态模型对吗?"** → [LOGIC.md](./LOGIC.md):纯逻辑模块 + 浏览器驾驶面板 + mermaid 状态图。
- **"这个界面该长什么样?"** → [UI.md](./UI.md):文字选型(界面结构未定时)→ 用户选定 → 单个自包含 HTML。

形态选错整个原型作废。**判据**:问题问的是"这样运转对不对"(状态、迁移、准入、数据形状)→ Logic;问的是"这样呈现对不对"(布局、层级、视觉、交互手感)→ UI;两者都问 → 拆成两个原型,不在一个文件里兼办。问题真含糊且用户不在场:后端模块倾向 logic、页面/组件倾向 UI,并写明假设——UI 原型写在说明文件的「问题」节(见 [UI.md](./UI.md)「说明文件」节),Logic 原型写在原型页的问题段。

## 本 skill 的文件

| 文件 | 用途 |
|---|---|
| [LOGIC.md](./LOGIC.md) | Logic 分支:产物结构、流程、反模式 |
| [STATE-MACHINE.md](./STATE-MACHINE.md) | 状态机建模约定 + 驾驶面板规范 + 实现约束(横切,真代码同样适用) |
| [UI.md](./UI.md) | UI 分支:文字选型 → 单变体 HTML |
| [MMD-STYLES.md](./MMD-STYLES.md) | mermaid 配色预设与写法约定(时序图/状态图) |
| [logic-template.js](./logic-template.js) | 逻辑模块骨架(initial/reduce/legal/TERMINAL + JSDoc) |
| [logic-page-template.html](./logic-page-template.html) | Logic 原型页模板(图渲染 + 驾驶面板 + 画布交互) |
| [gallery-template.html](./gallery-template.html) | 画廊壳模板(含统一设置) |
| [sync-mmd.mjs](./sync-mmd.mjs) | `.mmd` → `model.mmd.js` 生成期同步脚本 |
| [demo-harness.js](./demo-harness.js) | 演示条脚本(统一外观与标记约定、拖动、收成悬浮球、限位视口、条宽收到最宽一行、组多时换行让出两侧底角、长说明换行、动作按下反馈) |
| [demo-dimensions.js](./demo-dimensions.js) | 产品维度脚本(设置原型页与画廊的统一设置写出语言、明暗等取值,其余原型页按声明跟随) |
| [app-identity.js](./app-identity.js) | 标签页标识脚本(在画廊壳与每个原型页的浏览器标签页上标出所属 app 的名字与图标) |

本 skill 的资产(本 skill 目录里除 Markdown 文档与以 `.` 开头的隐藏文件外的全部文件)按进项目的方式分两类,新增资产时必须先定它属哪一类:

- **原样复制的资产**:复制进项目后不再改动的文件,复制目标与时机见「画廊」节的懒创建。**正本在此**,项目里的是复制实例:要改行为,必须改这里的正本再重新复制,不得手改实例。文件开头的第一段注释(跳过 `#!` 行与 `<!doctype>` 行)必须在同一行里写出复制来源标记 `copied from the prototype skill's template`,复制进任何 `working-language` 的项目都原样保留、不得改写。项目的原型目录里,复制来的文件与原型页的扩展名相同,项目的检查可以靠这个标记认出复制来的文件;改成按清单认,本 skill 新增或改名资产时清单不会跟着变,漏掉的文件就被当成原型内容放过。
- **照模板填写的资产**:复制后填进原型自己的内容、此后照常编辑的文件,即 [LOGIC.md](./LOGIC.md) 产物结构里写明「复制填充」的模板。项目里的是该原型自己的文件,不得带复制来源标记。

改动本 skill 的资产后,必须在本 skill 所在仓库的根目录运行 `node scripts/check-prototype-copies.mjs`,退出码非 0 不得提交。它按上面两类逐个核对本 skill 的资产,照模板填写的资产在脚本里逐个列出;因此新增或改名照模板填写的资产时,必须同时改脚本的列表。

## 通用规则

1. **位置与命名**:统一放 `docs/prototypes/<功能模块>/`(模块名对齐 docs/features/ 的 slug 或 CONTEXT.md 术语簇;新功能用其 feature-slug)。**不进 src/**。必须写明原型化的目标功能与问题,补足上下文:UI 原型写在页面旁的说明文件里(见 [UI.md](./UI.md)「说明文件」节),Logic 原型写在原型页的问题段(见 [LOGIC.md](./LOGIC.md))。
2. **一条命令可跑**:logic 接入项目既有 task runner;HTML 双击/浏览器直开。
3. **默认零持久化**:状态只在内存——持久化是原型要检验的对象,不是它可依赖的东西。**例外仅限读者的浏览状态**(演示条的位置与收起、画廊侧栏的折叠,以及 [UI.md](./UI.md) 演示基建条款第 5 条的产品维度取值连同设置原型页的偏好):它们服务于读者跨页、跨次浏览,不是原型要检验的持久化行为,可存浏览器本地存储,读写失败时页面必须照常运行。
4. **跳过打磨**:无测试、无错误处理(仅保可跑)、无抽象、无泛化("将来支持 X"禁止)。[UI.md](./UI.md) 要求的共享件与一致性检查不在此列:它们防的是原型页之间的走样,不是打磨单页。
5. **状态外显**:每次动作(logic)/每次切换(UI)后,渲染完整相关状态。
6. **用后捕获,原型保留**:答案(裁决+它解决的问题)记入 issue/commit;验证过的**决策**折进真代码/spec/ADR(mermaid 图按 to-spec 豁免条款可直接内联);验证过的逻辑模块提升进真代码。**原型本身是持久资产,留在 `docs/prototypes/` 不清空**——状态机图 + 可驾驶面板是模型的活文档,清掉等于每次重造。候选页除外:它在用户选定后即删(见 [UI.md](./UI.md)「候选页」节)。
7. **防腐烂(原型持久化的代价,必须付)**:原型描述**模型**(状态/迁移/准入条件),**不写产品实现的细节**(源码文件路径、字段名、函数签名)——与 CONTEXT.md 同规矩,不含易腐内容。原型自身的文件名(共享件、其他原型页、候选页)不在此列:它们与原型在同一处、随原型一起改。模型演化时同步改 `.mmd` 与逻辑模块并重跑 sync-mmd.mjs;做不到就在原型页问题段标注「已失效:模型已演进,见 <出处>」——**失效标注优于静默腐烂**。对应功能被移除时,连同原型目录与 manifest 条目一并删除。
   **失效标注按结论逐条判,不按整页判**:一页原型常同时承载多个结论,其中一条被推翻不代表整页作废。**判据**——被推翻的那条结论,当初是靠这页的哪个可见部分做出的?标注必须指明那个部分(该分栏、该控件、该图)并写明现在以什么为准——Logic 原型贴在该图的问题段,UI 原型写进说明文件的「已失效结论」节(见 [UI.md](./UI.md)「说明文件」节);整页前提都变了才整页标失效。只笼统写一句"部分已变"等于没标:读者无从知道哪一半还能信。
8. **持久文档不引用原型路径**:ADR、spec、复盘、功能目录里留的是**结论本身**(内联),不留指向原型文件的指针——原型会被合并、重构、删除,指针必然腐烂,而修指针又会污染只追加的文档。因此删除或合并原型时只需处理 manifest 条目与其他原型的 `data-goto` 接线,不必回头去改持久文档。
9. **每次改完原型必须交付可点开的浏览器预览链接**(硬规则,新建与修改同等适用):
   - **何时**:任意一次写入/覆盖了 `docs/prototypes/` 下可供预览的页(UI 的 `.html`、Logic 的 `index.html`、画廊壳)之后,在**同一轮对用户的回复里**必须给出链接——不得只写相对路径、不得只说「已更新、请自行打开」。
   - **给什么**:至少一条用户点一下(或复制到地址栏)就能在系统浏览器打开的 **`file://` 绝对 URL**。拼法:仓库根的绝对路径 + `/docs/prototypes/...` 的 POSIX 路径;空格与特殊字符按 URL 规则编码。macOS/Linux 形如 `file:///Users/…/docs/prototypes/<模块>/….html`。
   - **画廊**(若该原型已在 `manifest.js` 注册):另给一条画廊深链更佳——`file://…/docs/prototypes/index.html#<module>/<id>`——但**不能替代**单页直链(独立打开不依赖壳)。
   - **多文件同轮改动**:每个被改到的可预览页各给一条直链;若只改了 `_shared` 资源,给所有声明使用该共享块的预览页直链(或明确列出受影响页并各给链接)。
   - **可选增强、不能顶替链接**:环境允许时可用系统命令用默认浏览器打开(`open` / `xdg-open` 等);打开失败或未执行时,链接仍必须在回复里。
   - **判据**:用户在不拼路径、不 `cd`、不靠文件管理器翻目录的前提下,仅凭回复中的链接即可预览本轮改动结果。缺链接即本轮交付未完成。
   - **与规则 8 的边界**:本规则约束的是**对用户的会话交付**,不是往 ADR/spec 里写死路径;持久文档仍只记结论。
10. **界面规范依赖**:UI 原型动手前先调 `/ui-design`(Skill 工具)载入界面硬性规范,其全部规则在原型阶段同等生效(原型载体的适配见 [UI.md](./UI.md)「/ui-design 接线」节);Logic 驾驶面板、画廊壳、演示 harness 等原型工装不适用。
11. **浏览器标签页标明所属 app(硬规则)**:画廊壳与每个原型页的标签页都必须带上所属 app 的名字与图标——同时开着几个项目的原型时,只有页面自身标题与浏览器默认图标的标签页分不出各属哪个 app。
   - **声明**:`manifest.js` 必须写明 `window.PROTOTYPE_APP = { name, icon }`。`name` 为 app 名;`icon` 为 app 图标相对 `docs/prototypes/` 的路径,必须是浏览器能显示的格式(png、svg、ico;安装包用的 `.icns` 不行)。app 尚未定图标时 `icon` 写 `null`,标签页标识脚本改以 app 名的首字母缩写生成图标(取法写在该脚本里);app 定下图标后,必须把 `icon` 改为该图标的路径。
   - **引入**:画廊壳与每个原型页都必须在 `<head>` 内先引入 `manifest.js`、再引入标签页标识脚本 `app-identity.js`(正本 [app-identity.js](./app-identity.js),复制时机见「画廊」节的懒创建)——脚本一运行就读取 `manifest.js` 里的声明,据此在页面标题前加上 app 名并设置标签图标,`manifest.js` 排在它后面时它读不到声明。路径前缀 UI 页为 `../`、Logic 页为 `../../`;画廊模板与 Logic 页模板已自带这两行,UI 页必须自行写上。
   - **页面不自设**:页面不得自行设置标签图标,`<title>` 不得写 app 名——脚本会再设一遍、再加一遍。

## 画廊(Figma 式浏览全部原型)

`docs/prototypes/index.html` = 画廊壳:左侧 Figma 式深色工具侧栏(按模块分组,可收起,快捷键 S) + 右侧屏幕;侧栏头部的设置按钮打开统一设置,为全部原型切换界面语言与外观明暗(规则见 [UI.md](./UI.md) 演示基建条款第 5 条)。**一切条目统一 iframe**——UI 是自包含 HTML,Logic 也是自渲染页(问题/图/命令都在页内),壳不做任何内容渲染。hash 路由可分享,↑/↓ 键切换。

- **懒创建**:首次生成原型时铺齐画廊基建——从本 skill 目录复制 [gallery-template.html](./gallery-template.html) → `docs/prototypes/index.html`、[demo-harness.js](./demo-harness.js) → `docs/prototypes/demo-harness.js`、[demo-dimensions.js](./demo-dimensions.js) → `docs/prototypes/demo-dimensions.js`、[app-identity.js](./app-identity.js) → `docs/prototypes/app-identity.js`,创建注册表 `manifest.js`(含所属 app 的声明,见通用规则 11;`window.PROTOTYPES = []`)与空维度登记表 `dimensions.js`(`window.DEMO_DIMENSIONS = {}`)。只有 Logic 页用得上的两样等首次生成 Logic 原型时再铺:复制 [sync-mmd.mjs](./sync-mmd.mjs) → `docs/prototypes/sync-mmd.mjs`,并**懒下载渲染库** `vendor/mermaid.min.js`(`curl -sL -o docs/prototypes/vendor/mermaid.min.js https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js`,约 3.4MB,一次下载后离线可用;缺失时 Logic 页自动降级为显示图源文本)。复制来的文件按「本 skill 的文件」节的原样复制资产处理。
- **注册表同步(硬规则)**:每生成一个原型,往 `manifest.js` 的 `window.PROTOTYPES` 追加一条 `{module, type:'ui'|'logic'|'candidates', id, name, path}`(`candidates` 只用于候选页,见 [UI.md](./UI.md)「候选页」节);删除原型同步删条目——注册表腐烂等于画廊失明。
- 技术约束的由来:注册表与图源经 .js 包装、且 .mmd→model.mmd.js 走**生成期**同步脚本(file:// 下运行时 fetch 本地文件被 CORS 拦,script 标签不受限);右屏统一 iframe(隔离各原型的 CSS/JS);渲染库 vendor 本地化不用 CDN 引用(离线可用,保自包含)。
