# Issue tracker:GitHub

本仓库的票是 GitHub Issues。

**所有 `gh` 操作的规范见 `/github-ops` 第 8 节**——命令形态、`-R` 的使用时机、多行正文的 heredoc 写法、取数配方都在那里,**本文不重复**,以免两处漂移。

## skill 说「发到 issue tracker」时

建一个 GitHub issue。

## skill 说「取回相关的票」时

`gh issue view <n> --comments`(不在该仓库的 clone 内时带 `-R`)。

## agent 可取的票用哪个标签

`ready-for-agent`。

`/to-tickets` 切出的票默认打这个标签——它们按构造就是可被无人值守 agent 抓取的。若本仓库的 tracker 已在用别的字符串(如 `agent-ready`),把这一行改成实际用的那个,skill 会照它来,不会另建重复标签。
