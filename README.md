# Skillshed

Personal engineering workflows for coding agents, packaged as Claude Code skills.

Skillshed is an opinionated collection of instructions, templates, and scripts for taking software work from an unclear request to a reviewed pull request. It covers requirements, prototypes, specifications, implementation, testing, review, and documentation.

The skills describe how an agent should work: establish the facts, settle decisions before implementation, make narrow but complete changes, and keep the project's documented behavior aligned with its code. They include supporting tools, but following an instruction is not the same as having an automated check enforce it.

**Language:** this README is in English. Most skill instructions are currently written in Chinese; the collection also includes English artifact names and reusable assets.

## Start here

Clone the collection:

```sh
git clone https://github.com/aloong-planet/skillshed.git
cd skillshed
```

Make the skill directories available through your agent's supported skill-loading mechanism. Each skill has a `SKILL.md` entry point; supporting documents and assets live beside it. Keep the directory layout intact: skills refer to sibling skills and to their own supporting files. Copying only a `SKILL.md` can leave those references unresolved.

For a project adopting the workflow, start with [repo-scaffold](repo-scaffold/SKILL.md). It establishes project conventions, including the issue tracker, documentation layout, and `capabilities.toml`. Those capability declarations tell other skills which checks and practices apply to the project.

Then choose an entry point that matches the work:

| What you need | Start with |
| --- | --- |
| Clarify a request or challenge a plan | [grill-with-docs](grill-with-docs/SKILL.md) |
| Explore an interface, state machine, or uncertain design | [prototype](prototype/SKILL.md) |
| Turn agreed requirements into a specification | [to-spec](to-spec/SKILL.md) |
| Split a larger feature into implementable tickets | [to-tickets](to-tickets/SKILL.md) |
| Implement an agreed specification, a ticket, or a requested change | [implement](implement/SKILL.md) |
| Review an existing change or its tests | [review-code](review-code/SKILL.md) or [review-tests](review-tests/SKILL.md) |

Read the relevant skill before using it. The skills contain specific prerequisites and links to the instructions needed for each kind of work.

## The workflow

The collection connects discovery, design, delivery, and maintenance:

1. **Establish facts and agree on requirements.** Use `grill-with-docs` to investigate the current system and resolve decisions with the user. Use `domain-modeling` for domain vocabulary and architectural decisions.
2. **Make the design concrete.** Use `prototype` to resolve design questions and `to-spec` to record the agreed behavior, boundaries, and acceptance criteria.
3. **Divide work when needed.** Use `to-tickets` for work that spans multiple implementation sessions, with dependencies and, for each acceptance item, the gate, test, or evidence that guarantees it.
4. **Implement and review.** Use `implement` to coordinate development, the runs that follow the change, and the independent review of the code, the tests and the acceptance criteria. `tdd` shapes the tests as they are written; `review-code` and `review-tests` define what the independent reviewer checks.
5. **Check the documents, then deliver.** Before the delivery, `implement` uses `features-catalog` to hand a sub-agent the check of specifications, decisions, terminology, and the other documents that describe the product against the implementation and against each other. The delivery itself goes to another sub-agent and keeps one record, its delivery note, which becomes the pull request's description.

The individual skills define the detailed gates and exceptions. For example, `implement` gives each change a risk tier, light, standard or core, set by what a mistake in it would cost: a light-tier change is reviewed by the agent itself, and a core-tier change needs a test for every costly failure its spec states about the code it touches, and a second independent review when the fixes to the first change product code. It does not require every task to become a new specification or ticket.

## Supporting skills

| Skill | Purpose |
| --- | --- |
| [repo-scaffold](repo-scaffold/SKILL.md) | Establish the project conventions and capability declarations used by the workflow. |
| [domain-modeling](domain-modeling/SKILL.md) | Clarify terminology, maintain the domain glossary, and record architectural decisions. |
| [tdd](tdd/SKILL.md) | Develop through test-driven slices with tests that remain useful through refactoring. |
| [review-code](review-code/SKILL.md) | Review assumptions, runtime behavior, security, and consistency in a commit range, and define the independent review's handback. |
| [review-tests](review-tests/SKILL.md) | Review written tests for coverage, false greens, duplication, placement, and shared test resources. |
| [features-catalog](features-catalog/SKILL.md) | Check project documents against the implementation and each other at the end of a change. |
| [github-ops](github-ops/SKILL.md) | Define conventions for branches, commits, pull requests, CI, and releases, and carry out a delegated delivery. |
| [research](research/SKILL.md) | Investigate a question against primary sources and record the findings with their citations. |
| [ui-design](ui-design/SKILL.md) | Apply shared requirements to user-facing interface changes. |
| [i18n](i18n/SKILL.md) | Guide multilingual interfaces, localized wording, and language preferences. |
| [electron-scaffold](electron-scaffold/SKILL.md) | Establish Electron security, packaging, signing, distribution, and test infrastructure. |
| [skill-policy](skill-policy/SKILL.md) | Define how to write and maintain the skills themselves. |
| [restart-gateway](restart-gateway/SKILL.md) | Restart the OpenClaw gateway when requested. |

## Repository layout

```text
<skill>/
  SKILL.md              Skill entry point
  ...                   Supporting guides, templates, scripts, or assets
docs/specs/             Specifications for changes to this collection
scripts/                Repository consistency checks
capabilities.toml       Capability declarations for this repository
```

Project conventions and artifact names are described in [repo-scaffold](repo-scaffold/SKILL.md). The [capability registry](repo-scaffold/capabilities-registry.md) defines the supported declarations and their meanings.

## Working on the collection

Start with [skill-policy](skill-policy/SKILL.md) when changing a skill. Check its callers, references, and supporting assets as well as the instruction being edited. Keep each change focused, and use [github-ops](github-ops/SKILL.md) for GitHub delivery.

Run the repository checks from the checkout root:

```sh
node scripts/check-artifact-names.mjs
node scripts/check-prototype-copies.mjs
```

The change-scope helper and the action-pin check can be tested directly:

```sh
node --test implement/change-scope.test.mjs
node --test github-ops/check-action-pins.test.mjs
```

The packaging helper's tests also need `electron-builder` and its dependency tree. To provide them without adding dependencies to this checkout, install them in a temporary directory with pnpm:

```sh
skillshed_test_deps="$(mktemp -d)"
pnpm --dir "$skillshed_test_deps" add --ignore-scripts electron-builder
NODE_PATH="$skillshed_test_deps/node_modules" node --test electron-scaffold/assets/mac-packaging.test.cjs
```

These checks cover specific consistency rules and helper behavior. Review changes to the instructions themselves against the workflow they describe.
