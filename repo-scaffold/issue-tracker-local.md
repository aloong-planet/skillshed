# Issue tracker:本地文件

本仓库的票是文件,不进任何远程 tracker。

## 约定

- 一个功能一个目录:`docs/.workings/<slug>/`
- 票是 `docs/.workings/<slug>/issues/<NN>-<slug>.md`,从 `01` 起按依赖顺序编号(阻塞者在前)
- **一票一文件,不得合并成单一文件**
- 依赖写在文件靠前处的 `Blocked by: NN, NN` 行;所列的票全部完成,该票才解除阻塞
- 状态写在靠前处的 `Status:` 行;agent 可取的票用 `ready-for-agent`
- 对话与补充追加在文件末尾的 `## Comments` 标题之下

## spec 不在这里

**spec 是结论,归 `docs/specs/<slug>.md` 长期维护**,不放在 `docs/.workings/` 下。`docs/.workings/` 只放过程:票与两份 review 记录。布局与理由见 `docs/agents/docs-layout.md`。

## skill 说「发到 issue tracker」时

在 `docs/.workings/<slug>/issues/` 下新建一个文件(目录不存在就建)。

## skill 说「取回相关的票」时

读引用到的那个路径。通常用户会直接给出路径或编号。
