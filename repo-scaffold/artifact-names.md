# 产物固定名称

skill 会往项目里写三类东西:固定名称(节名、标签、取值、标题)、整篇种子文本、原样复制的资产。三类都受项目 `working-language` 管辖(登记表 [capabilities-registry.md](./capabilities-registry.md) 的 `working-language` 一行),本文规定各自怎么写。

## 固定名称

固定名称按定义它的文件分表登记在 [artifact-names/](./artifact-names/) 下,一个定义文件一张,称**小表**:定义文件是 `<skill>/SKILL.md` 的,小表是 `artifact-names/<skill>.md`;是 `<skill>/<文件名>.md` 的,小表是 `artifact-names/<skill>.<文件名>.md`。小表必须只有「中文规范名」「en」两列,文件头必须有一句链接到本节。

skill 条文与模板以中文规范名给出、要写进项目产物的固定名称,必须按项目的 `working-language` 书写:`zh` 写中文规范名,`en` 写它所在小表的英文名。**不得临时自行翻译**——其他 skill 按名称查找各节,同一名称各译一次,查找就会落空。

- **新增**:skill 改动凡引入一个要写进项目产物的固定名称,必须在同一次改动里登记进定义它的文件对应的小表(没有就按本节开头的文件名规则新建),并让定义它的文件链接该小表;别的文件的模板用到它时,该文件也必须链接这张小表。
- **改名或删除**:必须先在全部 skill 目录里全量检索该名称(检索须跟进软链接),把引用处改完再动小表。
- **核验**:改动 skill 后必须在仓库根运行 `node scripts/check-artifact-names.mjs`,退出码非 0 不得提交;它核对各小表的完整性及其与定义文件的对应、各模板里的固定名称是否全部登记且模板所在文件链接了所用名称的小表、资产是否零中文。

## 种子文本

下列文件是整篇写进项目的种子文本:不存在按名称查找,所以不逐词对照,而是写入时按项目的 `working-language` 整篇成文(其中的固定名称仍按各自所在的小表)。

- `repo-scaffold/docs-layout.md`:种子文本,写进 `docs/agents/docs-layout.md`
- `repo-scaffold/issue-tracker-github.md`:种子文本,写进 `docs/agents/issue-tracker.md`
- `repo-scaffold/issue-tracker-local.md`:种子文本,写进 `docs/agents/issue-tracker.md`

模板里的说明性正文(占位符 `{…}`、`<…>` 里的填写指引,以及标题与标签之外的叙述句)同样按 `working-language` 成文。

## 资产

原样复制进项目的文件与代码块一律以英文书写,不含中文:复制后源注释、终端输出与界面文案直接符合 `working-language` 为 `en` 的项目;项目工作语言为其他语言时,复制时按该语言改写;原型 skill 的复制来源标记除外,它按 [prototype/SKILL.md](../prototype/SKILL.md)「本 skill 的文件」节原样保留。

- 资产文件:`electron-scaffold/assets/` 下全部文件,`prototype/` 下除 Markdown 文档与以 `.` 开头的隐藏文件外的全部文件。
- 资产代码块:`electron-scaffold/`、`prototype/` 下的文档与 `github-ops/checks-gate.md` 中,会被复制进项目的代码块在围栏前一行标注 `<!-- asset -->`,必须零中文;只作讲解、不进入项目的代码块若含中文,标注 `<!-- example -->`。这两处文档里含中文的代码块缺标注即为未归类。
