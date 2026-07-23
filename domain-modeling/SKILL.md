---
name: domain-modeling
description: 建立并磨利项目领域模型:钉术语、维护 CONTEXT.md、按规范落 ADR。当用户要澄清领域术语/记录架构决策,或其他 skill(grilling、to-spec、triage)需要维护领域模型时激活。
---

> Fork 自 mattpocock/skills(2026-07 快照)。修改:ADR-FORMAT 换 MADR minimal(五段+必填备选+三态);CONTEXT-FORMAT 加可选节;新增 docs/adr/README 生成与维护。

# Domain Modeling

设计过程中**主动**建立并磨利领域模型:质疑术语、发明边界场景、共识一成形立即落盘。
只是"读 CONTEXT.md 取词汇"不算本 skill——那是任何 skill 都该有的一行习惯;本 skill 用于**改变**模型,不是消费它。

## 文件结构

单上下文(绝大多数仓库):根目录 `CONTEXT.md` + `docs/adr/`。
多上下文仓库以根目录 `CONTEXT-MAP.md` 为准(格式见 [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md)),按当前话题推断所属上下文,不明确就问。

**懒创建**:有东西可写才建文件。第一个术语敲定时建 CONTEXT.md;第一条 ADR 需要时建 `docs/adr/`——**连同 README.md 一起**(规范声明+索引,见 [ADR-FORMAT.md](./ADR-FORMAT.md))。

## 会话中的动作(全部即时逐条,不攒批)

- **对着词汇表质疑**:用户用词与 CONTEXT.md 冲突时当场指出——"词汇表定义的『取消』是 X,你说的似乎是 Y——哪个?"
- **磨利模糊词**:用户用含糊/多义词时,提议精确的规范词——"你说『账号』,指 Customer 还是 User?这是两个东西。"
- **拿具体场景压测**:讨论领域关系时发明边界场景,逼出概念之间的精确边界。
- **与代码互证**:用户陈述某事如何工作时,查代码是否同意;发现矛盾当场摆出——"代码是整单取消,你刚说可以部分取消——哪个对?"
- **即时更新 CONTEXT.md**:术语一敲定马上写入,格式见 [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md)。CONTEXT.md 是**纯词汇表,零实现细节**——不是 spec、不是便签、不是实现决策存放处。
- **稀疏地 offer ADR**:三门槛**同时满足**才提议(缺一即跳过),经用户确认后按 [ADR-FORMAT.md](./ADR-FORMAT.md) 落盘:
  1. **难逆转**——之后改主意的代价可观
  2. **无上下文会费解**——未来读者会问"当年为什么这么搞"
  3. **真实 trade-off 的产物**——存在真备选,因具体理由选了其一
