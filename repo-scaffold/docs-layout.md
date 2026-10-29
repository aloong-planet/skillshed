# 文档布局

本仓库的文档放在哪、哪些可以当依据、哪些不可以。

## 结论与过程,是两回事

**结论类**——回答「现在什么是对的」,可以被任何 skill 当依据:

| 位置 | 回答的问题 | 谁维护 |
|---|---|---|
| `docs/CONTEXT.md` | 术语的准确含义、该避免哪些同义词 | `/domain-modeling` |
| `docs/adr/` | 为什么这么定、否决了什么 | `/domain-modeling` |
| `docs/specs/<slug>.md` | 这个功能穷举过哪些边界、哪些明确不做 | `/to-spec` |
| `docs/features/<slug>.md` | 当前版本用户可见的行为 | `/features-catalog` |
| `docs/prototypes/` | 界面与状态模型长什么样 | `/prototype` |
| `docs/postmortems/` | 某次事故的因果链 | `/implement` 第 7 步 |
| `docs/ops/` | 本项目的运维手册(签名、发布等的实际取值) | 各项目自定 |

`docs/specs/` 与 `docs/features/` 的 **slug 一一对应**:features 里有 `memory-view.md`,spec 就是 `docs/specs/memory-view.md`。

**过程类**——回答「当时是怎么干的」:

| 位置 | 内容 |
|---|---|
| `docs/.workings/<slug>/` | 施工票、`review-code.md`、`review-tests.md` |

**`docs/.workings/` 不进仓库(仓库 `.gitignore` 忽略整个目录),内容保留、不删,但不得被任何 skill 当作可靠依据。** 用 worktree 工作时写在哪个检出里,见全局指令「施工记录存储」节。 读它只为回答「这件事当时为什么这么做」,不得据以推断现状。与结论类文档冲突时一律以结论类为准,**且不必回头修改施工记录**——它就该保持当时的样子。它是隐藏目录,不参与文档发布,也不被 `docs/**/*.md` 这类 glob 匹配。

## 探查时先读这些

动手改代码或提方案之前,先读:

- `docs/CONTEXT.md` 的目录,用到的术语再取单条(读法见全局指令「读项目词汇表 `CONTEXT.md`」);若存在 `docs/CONTEXT-MAP.md`,按它找到与当前话题相关的那个上下文的 `CONTEXT.md`(格式与推断规则见 `/domain-modeling` 的 `CONTEXT-FORMAT.md`)
- `docs/adr/` 中与本次改动区域相关的 ADR;多上下文仓库还要看该上下文目录下的 `docs/adr/`

**这些文件不存在时静默继续。** 不得提示它们缺失,不得建议提前创建——`/domain-modeling` 会在术语或决策真正敲定时懒创建。

## 用词汇表里的词

产出里凡是提到领域概念(issue 标题、方案、假设、测试名),**必须用 `CONTEXT.md` 里定义的那个词**,不得漂移到它 `_Avoid_` 明确列出的同义词。

需要的概念不在词汇表里,是个信号:要么是在发明这个项目不使用的说法(该重新考虑),要么是真缺一条(记下来交给 `/domain-modeling`)。

## 与既有 ADR 冲突必须显式指出

产出若与某条 ADR 相抵触,**必须点名说出来,不得静默覆盖**:

> _与 ADR-0007(事件溯源的订单)相抵触——但值得重开,因为……_
