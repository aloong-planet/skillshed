---
name: implement
description: 按 spec/tickets 实施开发,编排第 4-7 步:分支→tasklist→/tdd 纵切→全量网关→/review-code→/review-tests→拆解归档→交付。用户说"实现/implement/开工做某 ticket"时激活。
---

> Fork 自 mattpocock/skills(2026-07 快照)。修改:扩为第 4-7 步编排器(分支纪律、验证网关、双 review 门、Spec 终检、拆解归档)。

实施 spec 或 tickets 描述的工作。编码全程遵循 CLAUDE.md 的**窄而完整**原则(正文只在 CLAUDE.md,此处不复制)。开始前读 CONTEXT.md 与相关 ADR。

## 第 4 步:实现

1. **分支**:从最新 master 拉 feature 分支(如 `feat/xxx`),所有改动在分支上,不直接改 master。
2. **tasklist 持久化**(TaskCreate/TaskUpdate);多步任务给出带验证检查点的计划,循环到验证通过。
3. **目标驱动**:先定可验证的成功标准与测试方法。
4. **`/tdd` 纵切循环**(红先于绿、一次一纵切、覆盖清单来自 spec 失败模式节)。无测试价值的(纯 UI/样式/一行配置)说明理由后跳过 TDD。
5. **验证网关**:每个纵切完成即跑 typecheck + 该单测;整体完成前跑全量(lint → 单元/集成 → e2e/端到端),**全绿才算这步完成**——不靠"我觉得过了",靠可跑的检查。

## 第 5 步:`/review-code`(批判式代码自审;重构项整理成清单经用户确认)

## 第 6 步:`/review-tests`(审测试本身)

## Spec 核销终检(第 7 步归档前,只读)

对照 spec 逐条核销,结论引 spec 原文:
- **缺失/部分实现**的需求 → 回第 4 步补实现(补完重过第 5/6 步的相应部分);
- **未记录的范围扩张**(spec 没要求却改了的)→ 与「窄而完整」的逐行可追溯要求互证,确属需要的补进 spec,不需要的回退;
- **与 spec 描述不符的实现** → 与用户确认:改代码,或确认偏离并更新 spec。

本终检只读不改代码;所有发现处理完毕后才进第 7 步归档。

## 第 7 步:拆解归档(回同步)

第 4-6 步产生的东西各归其位:

- **新拍的决策**(尤其实现期踩坑改向的)→ ADR(按 domain-modeling/ADR-FORMAT;顺带检查有无「提议」态 ADR 该升级或推翻);
- **新术语/新消解的歧义** → CONTEXT.md;
- **值得留的踩坑因果链** → `docs/` 复盘文档;
- **spec/tickets 是施工文档**:同 feature 还有未完成 ticket 时,把已定的偏离更新进 spec(后续 ticket 依赖它的准确性);全部完成则不精修,合并后 `.scratch/<slug>/` 整目录删除。

## 交付

遵循 **github-ops**(commit/push/PR 全程无 AI 署名):push 分支 → 开 PR → 默认 squash 合并保持 master 线性、合并后删远程分支;合并方式有特殊需要用户会说明,不确定时问。交付前确认本 skill 全部步骤已完成。
