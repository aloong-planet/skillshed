# Merge check

> Related: `/github-ops` ([merge-check.md](../../github-ops/merge-check.md), [merge-check.mjs](../../github-ops/merge-check.mjs)) · [check-spec.mjs](../../to-spec/check-spec.mjs) · [check-adr.mjs](../../domain-modeling/check-adr.mjs) · [change-scope.mjs](../../implement/change-scope.mjs) · [check-action-pins.mjs](../../github-ops/check-action-pins.mjs)

## Problem Statement

Before an agent merges a pull request into a public repository, it checks a dozen facts that need no judgment: the pull request is still the commit it reviewed, the texts that will be published carry no home path, account name, private email or AI attribution, the description closes only the issues it means to, every commit is published under the expected address, the CI tested this head against the current default branch, and the document checks pass. Done by hand, each fact is another command and another reading of its output, and a check that is skipped or misread lets private data into a public history or closes the wrong issue. Nobody notices afterwards.

## Solution

One script in `/github-ops` runs every mechanical check, before the merge and again after it. For each check it prints whether it passed, with the lines that prove it, and lists what is left for the agent to judge. It only reads: it never merges, never deletes a branch and never writes to GitHub.

## Functional Requirements

### merge-check::REQ-001 Invocation

The script is `github-ops/merge-check.mjs`, run with node. It has three forms:

```text
merge-check.mjs before --repo <owner/repo> --pr <N> --head <sha> --squash-body <file> [--checkout <dir>] [--forbid <regex>]... [--ignore-job <regex>]...
merge-check.mjs after  --repo <owner/repo> --pr <N> --head <sha> [--checkout <dir>] [--forbid <regex>]...
merge-check.mjs --list
```

- merge-check::REQ-001/AC-01: `--repo`, `--pr` and `--head` are required in both modes, and `--squash-body` is required in `before`. `--head` is the full SHA of the commit the caller reviewed, in either case. A missing or repeated required argument, an unknown argument, a `--repo` that is not `<owner>/<repo>`, a `--pr` that is not a positive integer, a `--head` that is not 40 hexadecimal digits, `--squash-body` or `--ignore-job` given in `after`, an unreadable `--squash-body` file, or a `--forbid` or `--ignore-job` that is not a valid JavaScript regular expression ends the run with exit code 2 and a usage message, before any check runs.
- merge-check::REQ-001/AC-02: `--checkout` defaults to the top level of the git repository holding the current directory. Where that directory is in no git repository, or the checkout's repository as `gh repo view` names it (`nameWithOwner`) is not `--repo`, the run ends with exit code 2 before any check runs.
- merge-check::REQ-001/AC-03: The default branch is the repository's `defaultBranchRef` as `gh repo view` reports it; no branch name is assumed.
- merge-check::REQ-001/AC-04: `--list` prints, for every check and report, its id, the modes it runs in, the checks it depends on and its rule in one line, and exits 0. These are the checks the two modes run, and no other list of them exists.

### merge-check::REQ-002 Output and exit codes

- merge-check::REQ-002/AC-01: Each check prints one line `<STATUS> <id>: <summary>`, and the lines that prove the result are indented under it. Each evidence line names its source: `title`, `body:<line>`, `squash-body:<line>`, `commit <short sha>`, `diff <path>:+<line>`, `path <path>`, `message:<line>`, `closingIssuesReferences`, `run <id> (<workflow>)` for a CI run, `<owner>/<repo>#<N>` for an issue, `committer` for the merge commit's committer, or the command whose output it quotes.
- merge-check::REQ-002/AC-02: The statuses are `PASS`; `FAIL`, the check ran and its rule does not hold; `SKIP`, the check does not apply, with the reason on the same line; `ERROR`, the check could not be completed, with the reason; and `BLOCKED`, the check did not run because a check it depends on gave `FAIL` or `ERROR`, written `BLOCKED <id>: not run, <check id> failed` or `… errored`. A check that does not run while every check it depends on passed or was skipped is an `ERROR`, not `BLOCKED`.
- merge-check::REQ-002/AC-03: After the checks a `For review:` block lists what the run reports without judging (merge-check::REQ-015), each item after the id of the check or report that gives it, and a last line gives the number of checks in each status. A report prints a status line only when it is `ERROR`; a report that did not run is listed under `For review:` as `<id>: not run, <check id> failed` or `… errored`.
- merge-check::REQ-002/AC-04: Every check of the mode prints its line in every run. The exit code is 0 when every check is `PASS` or `SKIP`; 2 when any check or report is `ERROR`, the run stopped under merge-check::REQ-001, the script failed outside every check, or SIGINT or SIGTERM ended it, whatever the other checks gave; and 1 otherwise. A run that ends with 2 is no verdict on the pull request.

### merge-check::REQ-003 The pull request before the merge

In `before`, read from `gh pr view <N> -R <repo>`.

- merge-check::REQ-003/AC-01: `pr-open`: `state` is `OPEN`.
- merge-check::REQ-003/AC-02: `pr-head`: `headRefOid` is `--head`.
- merge-check::REQ-003/AC-03: `pr-base`: `baseRefName` is the default branch.
- merge-check::REQ-003/AC-04: `pr-mergeable`: `mergeable` is `MERGEABLE` and `mergeStateStatus` is `CLEAN`. While either reads `UNKNOWN`, the pull request is read again, five reads in all, three seconds apart; still `UNKNOWN` after the fifth read gives `ERROR`, never `FAIL`.
- merge-check::REQ-003/AC-05: Every check that reads the head's commits, tree or diff depends on `pr-head` and `head-ref`, and `pr-mergeable` depends on `pr-open`; `--list` prints each check's dependencies.

### merge-check::REQ-004 The head and the default branch

- merge-check::REQ-004/AC-01: `head-ref`: the run fetches the default branch and `pull/<N>/head` from `origin` into the checkout, and the fetched head is `--head`.
- merge-check::REQ-004/AC-02: `up-to-date`: the tip of `origin/<default branch>`, as just fetched, is an ancestor of the head or the head itself. The fork point used everywhere else is `git merge-base <head> origin/<default branch>`.

### merge-check::REQ-005 The texts that are checked

| Text | Mode | Read from |
|---|---|---|
| title | before | the pull request's `title` |
| body | before | the pull request's `body` |
| commit messages | before | each commit of `<fork point>..<head>`, `git log --format=%B` |
| squash body | before | the `--squash-body` file |
| added lines | before | the lines a `git diff <fork point>..<head>` adds; binary files add none |
| file paths | before | the head-side path of every file the diff changes |
| landed message | after | the full message of the pull request's merge commit |

| Check | Texts |
|---|---|
| `closing-keywords` (REQ-006) | title, body, commit messages, squash body, landed message |
| `closing-links` (REQ-007) | body, squash body, landed message |
| `privacy` (REQ-008) | every text above |
| `attribution` (REQ-009) | title, body, commit messages, squash body, landed message |
| `forbidden-words` (REQ-010) | every text above |
| `bare-refs` (REQ-011) | title, body, commit messages, squash body, landed message |

- merge-check::REQ-005/AC-01: Each check reads exactly the texts its row names, in the modes those texts exist in; a match is reported with its source as merge-check::REQ-002/AC-01 writes it.

### merge-check::REQ-006 Closing keywords

A closing reference is a case-insensitive match of `(close[sd]?|fix(e[sd])?|resolve[sd]?):? *([\w.-]+/[\w.-]+)?#[0-9]+`. A `Closes` line is a line that, with its surrounding whitespace removed, is exactly `Closes #<digits>`.

- merge-check::REQ-006/AC-01: `closing-keywords` fails on every closing reference outside a `Closes` line of the body, the squash body or the landed message: in the title, in any commit message, and on any other line of those three texts.

### merge-check::REQ-007 Closing links agree with GitHub

`closingIssuesReferences` of `gh pr view` is GitHub's list of the issues the merge will close.

- merge-check::REQ-007/AC-01: `closing-links` fails on each entry of `closingIssuesReferences` that is not an issue of `--repo` named by a `Closes` line of the body, and on each `Closes` line of the body whose issue is not in `closingIssuesReferences`.
- merge-check::REQ-007/AC-02: It fails on each `Closes` line of the squash body, and after the merge of the landed message, whose issue is not in `closingIssuesReferences`. The squash body may name fewer issues than the body.

### merge-check::REQ-008 Privacy

The values are derived when the run starts, from the environment the run is in:

- `$HOME`;
- `$USER`, where each of `_`, `-` and `.` in it matches any of the three;
- every value of `git config --show-scope --get-all user.email` in the checkout, all scopes, except the expected noreply address (merge-check::REQ-012);
- the local part of each such address, except where it equals the `login` of `gh api user`, ignoring case.

- merge-check::REQ-008/AC-01: `privacy` fails on every case-insensitive occurrence of a derived value in its texts.
- merge-check::REQ-008/AC-02: `$HOME` or `$USER` unset or empty, or a derived value shorter than 3 characters, gives `ERROR`.
- merge-check::REQ-008/AC-03: The generic paths `/Users/`, `/home/` and `~/`, matched case-insensitively in the same texts, never fail the check; each occurrence is listed under `For review:`.

### merge-check::REQ-009 AI attribution (direct acceptance)

`attribution` fails on every case-insensitive match of `co-authored|generated with` in its texts.

### merge-check::REQ-010 Forbidden words

- merge-check::REQ-010/AC-01: `forbidden-words` fails on every case-insensitive match of any `--forbid` pattern in its texts.
- merge-check::REQ-010/AC-02: With no `--forbid` given, it is `SKIP` with the reason "no --forbid given".

### merge-check::REQ-011 Bare references (direct acceptance)

A bare reference is `#` and digits with no ASCII letter, digit, `_`, `&`, `#` or `/` before it and no ASCII letter, digit or `_` after it, the ticket number of `/to-spec`'s check-spec.mjs. `bare-refs` looks each one up with `gh api repos/<repo>/issues/<N>`, which answers for issues and pull requests alike, and fails on each that does not exist; the title and state of each that exists go under `For review:`.

### merge-check::REQ-012 Commit identity (direct acceptance)

The expected noreply address is `<id>+<login>@users.noreply.github.com`, from `gh api user`. `commit-identity` fails on each commit of `<fork point>..<head>` whose author email or committer email is not that address, and prints the address it expected.

### merge-check::REQ-013 The CI on the head

The runs considered are those `gh run list -R <repo> --commit <head>` lists with event `pull_request`, the most recent one of each workflow. A current-tip merge line is a line `HEAD is now at <x> Merge <head> into <tip>` in a job's log, `<tip>` being the tip of `origin/<default branch>` fetched in this run.

- merge-check::REQ-013/AC-01: With no such run and no file under `.github/workflows/` at the head, `ci` is `SKIP` with the reason "no CI workflow". With no such run while workflow files exist, it fails.
- merge-check::REQ-013/AC-02: A run whose `headSha` is not the head fails.
- merge-check::REQ-013/AC-03: A job whose whole name matches an `--ignore-job` pattern, case-sensitively, is left out of every requirement below and listed under `For review:` with its status and conclusion. `For review:` also lists, for each pattern and each run, the job names it matched, or that it matched none.
- merge-check::REQ-013/AC-04: A run with no ignored job fails when its `status` is not `completed`, with the summary "not finished: wait with watch-ci.sh, then rerun", and when its `conclusion` is not `success`. A run with an ignored job is held instead to every other job being `completed`, the same summary applying when one is not; its own status and conclusion go under `For review:`.
- merge-check::REQ-013/AC-05: Every job that is not ignored concluded `success` or `skipped`.
- merge-check::REQ-013/AC-06: The logs of the run's jobs that are not ignored and not skipped, each read on its own, hold at least one line `HEAD is now at <x> Merge <a> into <b>`, and every such line is a current-tip merge line. A run in which no such job has one fails, so a run whose jobs are all ignored never passes. A merge into an older tip fails, with the summary that the CI tested against an older default branch.

### merge-check::REQ-014 The document checks of the head

They run in a detached worktree of the head (merge-check::CON-002), with node, from the worktree's root. Each prints the checked script's full output, its "For review" lines included, under its line.

- merge-check::REQ-014/AC-01: `spec-check` runs `check-spec.mjs --base <fork point>` of `/to-spec` when the diff changes any path under `docs/specs/`, and is `SKIP` otherwise.
- merge-check::REQ-014/AC-02: `adr-check` runs `check-adr.mjs --base <fork point>` of `/domain-modeling` when `docs/adr/` exists at the head and the diff changes any path under `docs/specs/` or `docs/adr/`. With no `docs/adr/` at the head it is `SKIP` with the reason "no docs/adr"; otherwise, with neither changed, `SKIP`.
- merge-check::REQ-014/AC-03: `action-pins` runs `check-action-pins.mjs` of `/github-ops` when the diff changes any path under `.github/workflows/`, and is `SKIP` otherwise.
- merge-check::REQ-014/AC-04: For each of the three, exit 0 is `PASS`, 1 is `FAIL` and any other result, the script missing included, is `ERROR`.

### merge-check::REQ-015 Reported for the agent to judge (direct acceptance)

In `before`, the `For review:` block lists: under the report `closing-issues`, the entries of `closingIssuesReferences`; under the report `changed-files`, every changed file with its change type, every changed file named `AGENTS.md` or `CLAUDE.md`, at any depth, and every changed binary file; under the report `documents-only`, whether the change is documents only, as `change-scope.mjs --base <fork point>` of `/implement` judges it in the worktree (exit 0 "no executable change", 1 "executable change", any other result `ERROR`); and the items merge-check::REQ-008/AC-03, merge-check::REQ-011 and merge-check::REQ-013 send there. None of them changes the exit code.

### merge-check::REQ-016 After the merge

In `after`, read from `gh pr view <N> -R <repo>` and the fetched default branch.

- merge-check::REQ-016/AC-01: `pr-merged`: `state` is `MERGED` and `mergeCommit` names a commit.
- merge-check::REQ-016/AC-02: `pr-head`: `headRefOid` is `--head`, and `head-ref` as merge-check::REQ-004/AC-01.
- merge-check::REQ-016/AC-03: `merged-tree`: the merge commit's tree is the head's tree.
- merge-check::REQ-016/AC-04: `merge-author`: the merge commit's author email is the expected noreply address; its committer is printed and not judged.
- merge-check::REQ-016/AC-05: The landed message gets the checks merge-check::REQ-005 assigns to it.
- merge-check::REQ-016/AC-06: `issues-closed`: every entry of `closingIssuesReferences`, of any repository, reads `closed`. An entry still open is read again for up to 30 seconds before the check fails.

### merge-check::REQ-017 What the merging agent does with the script

Applies to every merge of a pull request that `/github-ops` governs, with the user's approval or without it under the `docs-auto-merge` exception.

- merge-check::REQ-017/AC-01: Before merging, the agent runs `before` on the head it reviewed. The run right before the merge passes as `--squash-body` the file the merge then uses as its body; an earlier run may pass a draft.
- merge-check::REQ-017/AC-02: The agent merges only after that run exits 0, or exits 1 where every `FAIL` is `spec-check` and the violations it reports do not keep the pull request from merging under [project-documents::REQ-011/AC-04](project-documents.md).
- merge-check::REQ-017/AC-03: The lines `spec-check` lists for review are judged, and a finding among them handled, under [project-documents::REQ-011/AC-04](project-documents.md); the fix is checked by a new `before` run on the new head.
- merge-check::REQ-017/AC-04: On exit 2 the agent removes the cause and runs again, and reports to the user a cause it cannot remove. On any other `FAIL` it does not merge: it fixes what it may fix and runs again, and reports the rest to the user.
- merge-check::REQ-017/AC-05: The `--forbid` patterns are those the project's `AGENTS.md` and the user's standing instructions forbid in published text. A job is passed to `--ignore-job` only where the project's `AGENTS.md` or the user's standing instruction says its result is not the evidence, or where its result waits on such a job, as a gate that needs it does; the agent's report quotes that rule and names that dependency.
- merge-check::REQ-017/AC-06: The `For review:` items and the content of the diff are judged by the agent before the merge.
- merge-check::REQ-017/AC-07: After the merge, the agent runs `after`, and reports each `FAIL` and `ERROR` to the user.

## Constraints

### merge-check::CON-001 The script only checks (direct acceptance)

Applies to both modes. The script runs no command that writes to GitHub: it does not merge, edit or comment on a pull request or issue, push, or delete a branch.

### merge-check::CON-002 The local state it makes, and only that

Applies to both modes.

- merge-check::CON-002/AC-01: The head is fetched into a ref unique to the run, `refs/merge-check/pr<N>-<process id>`. A ref of that name that exists before the fetch ends the run with exit code 2. Besides that ref, the run changes only `refs/remotes/origin/<default branch>`, which merge-check::REQ-004/AC-01 fetches.
- merge-check::CON-002/AC-02: The worktree of `before` is `$HOME/worktrees/<name>/pr<N>-merge-check`, detached at the head, `<name>` being the directory name of the main checkout, the first line of `git worktree list`. A path that already exists ends the run with exit code 2 and is left as it was.
- merge-check::CON-002/AC-03: The ref and the worktree, and any directory the run created to hold the worktree, are removed on every way the run ends after making them. A removal that fails is an `ERROR` of the check `cleanup`, naming what was left. Only what the run made is removed: a worktree another run makes at the path after this run checked it is left as it is, and the check that needed the worktree is `ERROR`.

### merge-check::CON-003 No personal data in the skill (direct acceptance)

Applies to the script, its tests and the documents that describe it. No account name, email address or home path is written into them; the values the privacy and identity checks compare against are derived when the script runs (merge-check::REQ-008, merge-check::REQ-012).

## Failure modes and boundaries

1. **The checkout belongs to another repository**, as when the command runs in the wrong directory: the run stops before any check (merge-check::REQ-001/AC-02).
2. **A commit is pushed to the pull request after the agent reviewed it**: `pr-head` or `head-ref` fails and the checks that read the head are `BLOCKED` (merge-check::REQ-003/AC-05).
3. **GitHub has not yet computed mergeability** (merge-check::REQ-003/AC-04).
4. **The default branch moved after the CI ran**, or the branch does not contain its tip: `ci` or `up-to-date` fails before the merge, not after it (merge-check::REQ-013/AC-06, merge-check::REQ-004/AC-02).
5. **A workflow has jobs the project does not take as evidence**, such as jobs on a runner the owner does not wait for (merge-check::REQ-013/AC-03, merge-check::REQ-013/AC-04).
6. **The repository has no CI** (merge-check::REQ-013/AC-01).
7. **A change touches specs in a repository without ADRs** (merge-check::REQ-014/AC-02).
8. **A derived privacy value is too short to search for**, or the environment does not give one (merge-check::REQ-008/AC-02).
9. **An issue is closed by GitHub a few seconds after the merge** (merge-check::REQ-016/AC-06).
10. **A previous run was interrupted and left its worktree or ref**, or another run on the same pull request is in progress (merge-check::CON-002/AC-01, merge-check::CON-002/AC-02).
11. **gh or git fails**, including an unauthenticated gh or a network error: the check that needed it is `ERROR` and the run exits 2 (merge-check::REQ-002/AC-04).

## Out of Scope

- Merging and the cleanup after a merge (deleting branches and worktrees): they are actions, and the script only checks.
- Judging the content of the diff, the closing issues and the "For review" lines: they need judgment, which stays with the merging agent.
- A leak in a form no derived value covers, such as a real name, and the content of binary files: no derivable pattern finds them; binary files are listed for review.
- A closure in another repository: `closing-links` fails on it, and such an issue is closed by hand after the merge.
- Deployment evidence: it is specific to each project and not GitHub's.
