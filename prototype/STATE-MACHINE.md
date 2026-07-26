# 状态机:建模约定 + 驾驶面板

状态机原型的横切规范。适用于 Logic 原型([LOGIC.md](./LOGIC.md)),也适用于真代码里设计状态机——建模约定与"准入条件从模型派生"这条,在产线同样成立。

## 一、建模约定

**逻辑模块纯净**:零 I/O、零 DOM、零 console.log 控制流;**面板单向依赖逻辑,反之不可**。这层分离是原型的遗产机制——验证过的模块可整体提升进真代码。

**语言 JS + JSDoc**:浏览器只跑 JS,故逻辑模块用 `.js` + JSDoc 类型(可被 TS 检查、可提升);`file://` 下 ES module import 受 CORS 限制,**挂 `window.<Name>` 而非 export**。骨架见 [logic-template.js](./logic-template.js)。

**形态按问题选**(不按好接面板选):纯 reducer `(state, action) => state` / 显式状态机(当"哪些动作现在合法"本身是问题时) / 纯函数集 / 带内部状态的类。

**空态用 `null` 表达**:没有实体时**不存在状态**——别往状态枚举里塞 `'idle'`/`'none'` 混进真实状态。`null` 让"无消息"与"消息处于某态"在类型上就分开;面板据此把一切事件置灰,唯一出路是入场事件。

**`legal(state)` 派生查询(核心)**:暴露"当前哪些事件合法 + 非法者原因",供面板派生置灰。**不重写规则**——对每个事件试跑 `reduce`,被拒(illegal 非空)即非法:

```js
function legal(s) {
  const out = {};
  for (const a of ALL_ACTIONS) {
    if (s === null) { out[a.type] = { legal:false, why:'空态:先入场' }; continue; }
    const next = reduce(s, a);
    out[a.type] = next.illegal ? { legal:false, why:strip(next.illegal) } : { legal:true, why:null };
  }
  return out;
}
```

规则永远只有 `reduce` 一处,`legal` 是它的派生查询,**两者不可能不一致**。若在 UI 里另写一遍准入条件(`status==='pending' && …`),那份拷贝迟早与模型腐烂到不一致——这是同一份知识存两处的典型代价。

**非法事件语义**:现实中多为**静默忽略**(重复 IPC、迟到回调、重启恢复都会真的到达)。`reduce` 拒绝时不抛异常,而是返回带 `illegal` 原因的原状态——面板据此外显,产线据此静默。

**终态**:集合独立命名(`TERMINAL`),终态后一切事件非法。终态判断只在此一处定义,消费方引用它,不抄字面量数组。

## 二、驾驶面板规范

浏览器里点按钮驱动状态机,状态与图同页。骨架见 [logic-page-template.html](./logic-page-template.html)。

- **状态卡**:status 徽标(按状态着色,终态与进行态可辨)+ 进度条 + 关键字段。**空态显 `—`,有实体但字段为空显 `null`**——两者语义不同,不可混用。
- **事件按钮**按语义分组(入场 / 用户与超时 / 传输…);**可用性从 `legal(state)` 派生**,不在 UI 判断。置灰即"当前状态不可达",是模型的可视化——看一眼亮暗就知道准入边界。
- **悬停置灰按钮给原因**(取自 `legal()` 的 why),不必撞上去才知道。
- **回执栏三态**:`尚未派发事件`(idle 淡显)/ `已派发 X → Y`(合法,事件名高亮)/ `⚠ X 被忽略:原因`(非法,红字)。**不要写"上一事件合法"这类零信息占位**。
- **清空按钮**:回到空态(`state = null`),入场每次重选;进度/字段/回执一并归零。
- **压测开关**(可选):解除置灰、允许强行派发非法事件,用于验证 `reduce` 防线真的挡得住。把"验证防线"这个小众需求降级为显式开关,不污染默认交互。
- **图上高亮当前状态节点**(按节点文本匹配 status);空态不高亮。

## 三、实现约束(踩坑固化,别再犯)

- **置灰用 `aria-disabled="true"`,不用原生 `disabled`**:disabled 元素**不触发 hover**,悬停提示就出不来。点击由 handler 开头 `if (aria-disabled) return` 拦截。
- **置灰不能用 `opacity`**:opacity 作用于整个元素**及其伪元素**,会连带压暗 tooltip 文字。改用颜色变淡 + 虚线边框 + 透明底三重信号。
- **tooltip 用 `data-tip` + CSS 伪元素**(`[data-tip]:hover::after { content: attr(data-tip) }`),不用原生 `title`——后者约 1s 延迟,置灰原因要即时可见。按钮需 `position:relative` 作定位上下文。
