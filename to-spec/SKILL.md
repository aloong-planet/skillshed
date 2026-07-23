---
name: to-spec
description: 把当前对话合成为 spec 并发布到 tracker——不采访用户,纯合成已讨论内容。七步流程第 2-3 步;grilling 达成共识后、切 ticket/实现前使用。
disable-model-invocation: true
---

> Fork 自 mattpocock/skills(2026-07 快照)。修改:模板新增「失败模式与边界」节;流程并入发布前设计自审。

本 skill 把**当前对话上下文** + 代码库理解合成为一份 spec(即 PRD)。**不采访用户**——只合成已知内容;对话里没有的东西合成不出来,所以必须与 grilling 同一个上下文窗口。
tracker 与标签约定读 `docs/agents/issue-tracker.md`(没有就先跑 `/setup-matt-pocock-skills`)。

## 流程

1. **探代码库**(若还没探):spec 通篇使用项目词汇表(CONTEXT.md)的语言;**尊重所触及区域的 ADR**——对话内容与某 ADR 冲突时指出冲突,不默写进去。
2. **勾画测试 seam**:优先复用既有 seam;尽量取最高层;越少越好(理想为 1)。seam 不明或需新建时问用户确认,否则自己定。结果写进 Testing Decisions。
3. **写 spec**(模板见下)。
4. **发布前设计自审**(发布门禁——审设计本身,独立于实现后的 /review-code):
   - 决策之间有无矛盾/依赖未消解;
   - 「失败模式与边界」节是否按**用户真实操作序列**穷举(不按"我要改的代码"穷举);涉及状态/effect 时,"该状态能从哪些路径进入/退出"是否列全;依赖数组、边界由**场景**推导,不由"最小"推导;
   - 逻辑漏洞、考虑欠缺处,补全后再发布。
5. **发布**到 tracker(本地模式:`.scratch/<feature-slug>/spec.md`;真 tracker 按约定打 `ready-for-agent` 标签)。

## Spec 模板

```md
## Problem Statement
{用户视角的问题}

## Solution
{用户视角的解法}

## User Stories
{长编号列表:"As an <actor>, I want <feature>, so that <benefit>"。极尽详尽,覆盖功能所有侧面。}

## 失败模式与边界
{按用户真实操作序列穷举:边界值、错误/失败路径、并发与 race、中断与恢复、
空/异常输入、与既有功能交互的回归点。每条写明预期行为。
此节是 /tdd 的覆盖清单与 /review-tests 覆盖维度的依据。}

## Implementation Decisions
{要建/改的模块、接口、架构决策、schema 变更、API 契约、具体交互。
**不写文件路径与代码片段**(很快过时)。
唯一例外:prototype 产出的、比散文更精确的决策性片段(状态机/reducer/schema/类型形状),
裁剪到只剩决策部分,注明来自 prototype。}

## Testing Decisions
{什么算好测试(只测外部行为,不测实现细节);测哪些模块(=第 2 步确认的 seams);
代码库里的既有先例(prior art)。}

## Out of Scope
{明确不做的}

## Further Notes
{其余备注}
```
