---
name: research
description: Investigate a question against high-trust primary sources and capture the findings as a Markdown file in a purpose-specific directory under ~/research/. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a background agent.
---

Two roles do the research. The **gatherer** is a background agent that collects evidence and nothing else. The **lead** is the session that received the research request: it checks the evidence, draws every conclusion and writes the document.

## The lead: send out the gatherer

Start a background agent as the gatherer, so the lead keeps working while it reads. When the tool cannot start a background agent, the lead does the gatherer's work itself under the rules of "The gatherer", then continues with "The lead: check, conclude, write".

1. When the tool lets a sub-agent's model be chosen, choose the smallest tier of the newest generation: where the tool offers tier aliases, the alias of the smallest tier; where only specific model IDs can be given, the smallest model of the newest generation. Do not choose a model of an older generation because it costs less.
2. When the tool lets a sub-agent's reasoning effort be chosen, choose the level named `high`; where no level has that name, the first level above the tool's default.
3. The instruction to the gatherer must state the question, and must tell it to load this skill through the tool's skill mechanism and act as the gatherer under "The gatherer".

## The gatherer

An agent sent out as the gatherer must not start another agent for this work. It writes no file. It hands back the following and nothing else.

1. A list of facts taken from **primary sources** only: official docs, source code, specs, first-party APIs. A secondary write-up may be used to find a primary source; it must not be cited.
2. For each fact, three things:
   - the excerpt, copied verbatim from the source: not translated, not paraphrased, not joined from two places;
   - its location: the full URL and the heading of the section it sits under, or for source code the repository, the commit or tag, the file path and the line;
   - one sentence restating what the excerpt says, without adding to it.
3. An excerpt must come from a source the gatherer opened in this run. Where the text could not be fetched, the hand-back says "text not obtained" with the URL tried; it must not give an excerpt from memory.
4. No conclusion, comparison or recommendation, and no answer to the question.
5. No negative statement of the gatherer's own ("does not exist", "is not supported"). Where it found no source for something, the hand-back says "not seen in the following sources" and lists each source it opened for it.
6. A closing list of every source it opened, each marked as opened or failed.

## The lead: check, conclude, write

1. Before a conclusion is written, every excerpt it rests on must be checked against its source: open the location given, or the same primary source reached another way, and find the excerpt there. An excerpt that is not found, or that differs from the source's text, is void, and the lead looks that fact up itself.
2. Only the lead decides between sources that disagree, and only the lead writes a negative conclusion. A negative conclusion needs a means that does not depend on how much was sampled: the source's own statement that the thing is absent or unsupported, a search of the whole source, or an exhaustive listing in the source. Without one, the document says "not seen in" and names the sources checked.
3. Write the findings to a single Markdown file, citing each claim's source.
4. Save every persistent research document under `~/research/<purpose>/`. Choose a stable, lowercase purpose directory that describes why the research exists, such as `xiaohongshu-publisher`, `electron-macos-release`, or `openai-api`.
5. Never create research documents in a project repository, including `docs/research/`, unless the user explicitly overrides this rule for that document. A project may link to the canonical research file when requested.
6. Reuse an existing purpose directory when its scope matches. Do not organize by the current repository name unless that repository is itself the research purpose.
