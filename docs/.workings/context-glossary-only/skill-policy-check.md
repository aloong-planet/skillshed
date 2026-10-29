# skill-policy self-check: CONTEXT.md becomes a glossary only (2026-10-29)

Scope: the clauses this change added or edited (skill-policy §5, "改完自审"). Unit: one list item, one
paragraph or one table row (skill-policy opening paragraph).

Change: `CONTEXT.md` keeps only vocabulary; invariants move to the project `AGENTS.md` (global rules repo);
the cross-project mechanisms behind agentshed's engineering invariants move up into the matching skills.

## Phase 1: wording, clause by clause

| # | File | Clause | Finding | Result |
|---|---|---|---|---|
| 1 | domain-modeling/CONTEXT-FORMAT.md | template: Contents heading, conditional on > 100 lines | imperative, countable | ok |
| 2 | 〃 | template: Contents placeholder | ok | ok |
| 3 | 〃 | template: term definition at most two sentences | countable | ok |
| 4 | 〃 | template: flagged ambiguity at most two sentences | countable | ok |
| 5 | 〃 | admission: all three tests must hold | imperative | ok |
| 6 | 〃 | test 1: project-specific | criterion stated | ok |
| 7 | 〃 | test 2: not derivable from code | criterion stated | ok |
| 8 | 〃 | test 3: vocabulary, three enumerated kinds | enumerated | ok |
| 9 | 〃 | no destination in the table → do not write, ask | closes the gap the table leaves | ok |
| 10 | 〃 | take a stand; omit _Avoid_ when there is no synonym | ok | ok |
| 11 | 〃 | definition ≤ 2 sentences; one parenthesis per avoided word | countable | ok |
| 12 | 〃 | flagged ≤ 2 sentences; drop when the old word appears in no other document | negative conclusion, needs a full search | ok |
| 13 | 〃 | falsifiable (now definitions only) | qualifier "与不变量" dropped: invariants are no longer admitted, no counterexample | ok |
| 14 | 〃 | sub-headings for clusters | had been tightened from "可用" to "用" without a criterion | fixed: original wording restored |
| 15 | 〃 | TOC above 100 lines (写法) | restates #1 | fixed: removed, #1 is the rule |
| 16 | 〃 | forbidden forms: check every row; pointer only | imperative | ok |
| 17 | 〃 | row: constraints → project AGENTS.md | unique destination | ok |
| 18 | 〃 | row: procedures | three destinations, no rule for which | fixed: by kind (product → spec, implementation → code, workflow → skill) |
| 19 | 〃 | row: project identifiers → code | ok | ok |
| 20 | 〃 | row: incident narrative → postmortem | ok | ok |
| 21 | 〃 | row: provenance-only dates → not written | ok | ok |
| 22 | 〃 | row: measurements | two destinations, no rule | fixed: decision's ADR, otherwise the measuring code's comment |
| 23 | 〃 | row: alternatives → ADR | ok | ok |
| 24 | 〃 | row: UI detail and release state | two kinds in one row | fixed: split into two rows |
| 25 | 〃 | external system names are not project identifiers | criterion stated | ok |
| 26 | domain-modeling/SKILL.md | 即时更新 CONTEXT.md: points at the format file | restatement of the format rules removed | ok |
| 27 | repo-scaffold/artifact-names/domain-modeling.CONTEXT-FORMAT.md | rows: Contents added, Invariants removed | check-artifact-names passes | ok |
| 28 | features-catalog/SKILL.md | stage 1 pair 4: terms → CONTEXT.md, invariants → AGENTS.md | ok | ok |
| 29 | 〃 | stage 3: general rule's home (AGENTS.md invariant / ADR / skill) | ok | ok |
| 30 | ui-design/SKILL.md | §9 trigger includes floating layers | ok | ok |
| 31 | ui-design/state-and-cascade.md | §5 intro: defines 浮层 | anchor for 32–35 | ok |
| 32 | 〃 | both obligations; hit-test criterion | criterion stated | ok |
| 33 | 〃 | fixed positioning escapes clipping; transform/filter/perspective | criterion stated | ok |
| 34 | 〃 | the layer's own scroll never repositions or dismisses | criterion stated | ok |
| 35 | 〃 | resize: operated layers reposition | had no criterion | fixed: criterion added |
| 36 | 〃 | scroll after resize belongs to the resize; window value in code | imperative | ok |
| 37 | prototype/UI.md | hit-test sentence → pointer to #32 | removes a second copy of #32 | ok |
| 38 | electron-scaffold/electron-testing.md | intro: project name and date removed | skill-policy §2 (touched clause) | ok |
| 39 | 〃 | §4: bounded close, kill the process group | criterion stated | ok |
| 40 | 〃 | §7 intro: measured data | premise stated (Electron 43, macOS, page cache) | ok |
| 41 | 〃 | §7: main-process figures only under Electron; bench script when the main process reads in bulk | conditional, imperative | ok |
| 42 | 〃 | §7: explicit chunk size, chosen on the whole cold scan | imperative | ok |
| 43 | 〃 | §7 criterion | ok | ok |
| 44 | electron-scaffold/SKILL.md | §5: bench script pointer | keeps §5's list in step with #41 | ok |
| 45 | 〃 | §6 when needed (with the mechanism) | ok | ok |
| 46 | 〃 | §6 what to install | missing in the first draft (section structure) | fixed: added |
| 47 | 〃 | §6 how | imperative | ok |
| 48 | 〃 | §6 verification | criterion stated, no mechanism claimed beyond what is checked | ok |
| 49 | 〃 | extension-slot comment | numbering followed §6 | fixed: now §7 / §8 |
| 50 | electron-scaffold/assets/ci-electron.yml | pinned placeholders and comment | asset, English only | ok |
| 51 | github-ops/SKILL.md | §7 pin every action | imperative, mechanism | ok |
| 52 | 〃 | §7 upgrade command | ok | ok |
| 53 | 〃 | §7 offline limits | "只能" read as description | fixed: "必须" |
| 54 | 〃 | §7 criterion | ok | ok |
| 55 | github-ops/checks-gate.md | skeleton: pinned placeholders and comment | asset, English only | ok |
| 56 | review-code/false-greens.md | form 4: three causes; equivalence example; criterion | example's premise stated (React 18.3) | ok |
| 57 | 〃 | form 5: retried negative assertions | criterion stated | ok |
| 58 | 〃 | form 9: no raw NUL at the source | criterion command tested on a NUL file and a clean one | ok |
| 59 | review-tests/mutation-testing.md | ① reach includes equivalence | in step with #56 | ok |

Phase 1 rerun after the fixes: zero findings.

## Phase 2: clauses grouped by what they constrain

Clauses: 59. Piles: 10.

| Pile | Members | Pairs and verdict |
|---|---|---|
| What CONTEXT.md admits, where constraints go | 5–25, 26, 28, 29; global AGENTS.md (new §52 destination, §16); implement/SKILL.md (新术语 → CONTEXT.md); prototype/SKILL.md (same rule as CONTEXT.md, no perishable content); repo-scaffold/docs-layout.md (CONTEXT.md row) | row 17 ↔ global §52: same destination, compatible; 28 ↔ global §35 (decisions → ADR, terms → CONTEXT.md): compatible, constraints are §52's; 29 ↔ global §52: same three homes, compatible; prototype rule ↔ row 19: compatible; docs-layout row ↔ 8: compatible |
| Table of contents | 1 (15 removed) | single |
| Floating layers | 31–36, 37; prototype/UI.md clipping fixes (two paths) | 33 ↔ prototype "move it out of the container": compatible, 33 covers fixed layers, the prototype path covers non-fixed ones; 32 ↔ 37: one rule, one pointer |
| Action pinning | 50, 51–54, 55 | compatible |
| Bounded e2e close | 39 | single |
| Main-process measurement | 40–43, 44 | compatible |
| userData | 45–48; electron-testing.md §4 per-case userData isolation | different objects (development runs vs test cases), compatible |
| Mutation equivalence | 56, 59 | compatible |
| Negative assertions | 57; false-greens.md opening rule "凡断言「X 不发生」,先故意让 X 发生一次" | compatible, complementary |
| NUL | 58; form 9 table row "被判为二进制" | compatible, one is the check, the other the prevention |

Section placement: §5 of state-and-cascade.md (interaction states and layering) contains floating layers;
github-ops §7 sits at the skill level because it covers every workflow, not only the gate; electron-scaffold §6
is a one-time naming decision in the scaffold list; electron-testing.md §7 is test infrastructure for
measurement; the three false-greens additions sit in the forms whose mechanism they share (4 mutation, 5
timing, 9 search exclusion).

Phase 2 rerun after the fixes: zero findings.

## Governance: untouched files of each touched skill

| Skill | Untouched files | Needs a change? |
|---|---|---|
| domain-modeling | ADR-FORMAT.md | no: its index grouping takes CONTEXT.md's term clusters, which remain |
| repo-scaffold | docs-layout.md, scaffolding.md, capabilities-registry.md, artifact-names.md, other tables | no: they name CONTEXT.md for terms only |
| features-catalog | — | — |
| ui-design | icon-preview.md, theme-vars-check.md, theme-vars.mjs | no |
| prototype | SKILL.md, other references and assets | no: SKILL.md line 48 still holds |
| electron-scaffold | electron-security.md, electron-security-howto.md, macos-signing.md, other assets | no: none has a `uses:` line or a userData naming rule |
| github-ops | release.md, release-note-template.md, ci-watch.md, first-push.md, issues.md, watch-ci.sh | no: no `uses:` line in any of them |
| review-code | SKILL.md | no |
| review-tests | SKILL.md | no |

## Found outside this change (not fixed here)

- skill-policy §2 date and project markers remain in electron-scaffold/SKILL.md §5 ("agentshed,2026-08-03/04")
  and electron-testing.md's opening quote and §4/§5 ("agentshed 教训", "agentshed 切隐藏窗口时"); untouched
  clauses, left as they are.
- github-ops/SKILL.md's description summarises the rules it enforces (skill-policy §4); untouched.

## Round 2 (2026-10-29): a fourth admission test, the second-sentence rule, read the contents first

Change: CONTEXT-FORMAT gains admission test 4 (a term is admitted only when it has a confusable concept named in
the entry, or a meaning its words do not give away), restricts a definition's second sentence to naming a
confusable concept or correcting a misreading, and guarantees the structure that the global instructions' new
"读项目词汇表 CONTEXT.md" section reads by (contents first, one paragraph per entry). implement, tdd and the
docs-layout seed now read CONTEXT.md that way instead of whole.

### Phase 1

| # | File | Clause | Finding | Result |
|---|---|---|---|---|
| R1 | domain-modeling/CONTEXT-FORMAT.md | template: Contents placeholder | restated the 写法 clause on names | fixed: pointer to 写法 |
| R2 | 〃 | template: term placeholder "至多两句" | restated 写法 #11; introduced in round 1 and missed by its phase 2 | fixed: pointer to 写法 |
| R3 | 〃 | template: flagged placeholder "至多两句" | restated 写法 #12; introduced in round 1 and missed by its phase 2 | fixed: pointer to 写法 |
| R4 | 〃 | admission intro "各条" | ok | ok |
| R5 | 〃 | test 4 | criterion stated (named confusable concept, or a meaning the words do not give away) | ok |
| R6 | 〃 | 写法: second sentence only for a confusable concept or a misreading | criterion stated | ok |
| R7 | 〃 | 写法: contents is the first `##` section | read as making a contents section mandatory below 100 lines, against the template | fixed: "有目录时" |
| R8 | 〃 | 写法: one paragraph per entry, title `**name**:` | checkable; mechanism stated | ok |
| R9 | implement/SKILL.md | read CONTEXT.md by the global section | pointer | ok |
| R10 | tdd/SKILL.md | 〃 | pointer | ok |
| R11 | repo-scaffold/docs-layout.md | 〃 (seed text) | pointer | ok |

Phase 1 rerun after the fixes: zero findings.

### Phase 2

| Pile | Members | Verdict |
|---|---|---|
| Contents | template annotation "全文超过 100 行时必有", R1, R7; global section "文件没有目录(不超过 100 行)" | compatible after R7's fix |
| Definition length and second sentence | R2, R6 | one rule, one pointer |
| Flagged entries | R3, 写法 #12 | one rule, one pointer |
| Admission | tests 1–4, forbidden-forms table | compatible: test 4 rejects what the table has no row for, and names the destination (the spec or ADR that uses the term) |
| How CONTEXT.md is read | global section; R8; R9–R11; features-catalog stage 1 pair 4 (same words in every document); domain-modeling's in-conversation checks; the truncation hook's partial-Read reminder on CONTEXT.md | compatible: the global section reads by paragraph through Bash, never by line range, so the hook stays silent (its three commands were fed to the hook: silent); whole reads remain for edits of CONTEXT.md itself |

The three extraction commands were run on agentshed's CONTEXT.md under /usr/bin/awk (version 20200816): the
contents, "Session ID", "Live (day, side)" and "Filtering and searching" by name, and "sidebar" by word (Rail).

Phase 2 rerun after the fixes: zero findings.

## Round 3 (2026-10-29): CONTEXT.md and CONTEXT-MAP.md live under docs/

Change: every project keeps its glossary at `docs/CONTEXT.md` (and a multi-context map at `docs/CONTEXT-MAP.md`);
a file still at the old root location is read where it is and moved under `docs/` before anything is written to it.

### Phase 1

| # | File | Clause | Finding | Result |
|---|---|---|---|---|
| L1 | domain-modeling/SKILL.md | 文件结构 | restated CONTEXT-FORMAT's single/multi-context rules and its inference rule (pre-existing, touched now) | fixed: pointer to CONTEXT-FORMAT and ADR-FORMAT |
| L2 | domain-modeling/CONTEXT-FORMAT.md | single context: `docs/CONTEXT.md` | ok | ok |
| L3 | 〃 | multi context: `docs/CONTEXT-MAP.md`; each context's `docs/CONTEXT.md` and `docs/adr/` | ok | ok |
| L4 | 〃 | inference rule with the `docs/` paths | ok | ok |
| L5 | 〃 | old location: `git mv` into `docs/` before writing; never both; read-only use reads it where it is | criterion stated | ok |
| L6 | repo-scaffold/docs-layout.md | table row and the read-first bullet name `docs/CONTEXT.md` and `docs/CONTEXT-MAP.md` | ok | ok |
| L7 | repo-scaffold/scaffolding.md | probe: `docs/` locations and a leftover root file, pointing at L5 | ok | ok |
| L8 | 〃 | B section default: `docs/CONTEXT.md` | ok | ok |

Phase 1 rerun after the fix: zero findings.

### Phase 2

| Pile | Members | Verdict |
|---|---|---|
| Where CONTEXT.md lives | L1–L4, L6–L8; the global instructions' reading section; agentshed's product spec (project-detail::REQ-003) | compatible: one location everywhere, stated once in CONTEXT-FORMAT, pointed at elsewhere |
| A file still at the old location | L5, L7; the global reading section's clause on the old location | compatible: reading reads it where it is, writing moves it first |

A full search of the skills for root-location wording (`根(目录)?…CONTEXT`, `仓库根…CONTEXT`, `根 CONTEXT`) returns
nothing after the change; `check-artifact-names.mjs` passes.

Phase 2 rerun: zero findings.
