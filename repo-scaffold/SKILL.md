---
name: repo-scaffold
description: 把一个仓库配置成这套 skills 能在其上运作的样子——记录 issue tracker 的位置与用法、文档布局约定;建立项目能力声明 capabilities.toml;为仓库接入 lint;并定义能力登记表与产物固定名称表。用户要求为仓库铺设或重铺这套约定时(首次使用这套 skills 之前、更换 issue tracker 时)使用;其他 skill 或全局指令要求查阅能力 ID 的定义、或产物固定名称在某种工作语言下的写法时,也经它载入。
---

# Repo Scaffold

给仓库铺一次性配置。铺完之后其余 skills 才知道:票往哪里发、文档往哪里放、术语从哪里取、项目有哪些跨 skill 生效的能力。

**四件事**:

- **Issue tracker** —— 票存在哪、怎么读写。`to-tickets` 与 `to-spec` 读它。
- **文档布局** —— 哪个目录放什么、哪些是结论、哪些只是过程记录。几乎所有 skill 都读它。
- **项目能力声明** —— 仓库根的 `capabilities.toml`。允许出现的 ID 及其形态、字段与默认值由本 skill 的 [capabilities-registry.md](./capabilities-registry.md) 定义;读写规则以全局指令的「项目能力声明」节为准,本 skill 不重复定义。
- **Lint** —— 为仓库接入 linter,并在 `capabilities.toml` 里声明。

**只为查阅而载入时不得铺设**:用户没有要求为本仓库铺设或重铺这套约定、而是其他 skill 或全局指令要查能力登记表([capabilities-registry.md](./capabilities-registry.md))或产物固定名称([artifact-names.md](./artifact-names.md) 与 [artifact-names/](./artifact-names/) 下各表)时,只读所需的引用文档,不得读取 [scaffolding.md](scaffolding.md),也不得执行其中的铺设。

**为本仓库铺设或重铺这套约定时**,必须完整读取 [scaffolding.md](scaffolding.md),按其第 1–6 节执行。
