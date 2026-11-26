# Cleanup after a merge

> Related: [closeout-path](closeout-path.md) · [risk-tiers](risk-tiers.md) · `/github-ops` ([SKILL.md](../../github-ops/SKILL.md)) · `/implement` ([SKILL.md](../../implement/SKILL.md))

## Problem Statement

After a pull request merged, the repository's main checkout stayed on the commit from before the merge, and the merged branch, its worktree and the drafts made on the way stayed where they were. Whatever read the main checkout, or ran an installation used in place from it, still got the code and the documents from before the merge. The agent asked the user after every merge whether to pull and what to delete.

## Solution

The agent that merges a pull request cleans up after it without asking: it deletes the pull request's remote branch, brings the main checkout up to the default branch, and deletes the pull request's local branch and worktree. Once the last pull request of a piece of work has merged, it also deletes the other branches and worktrees that work left. A step whose conditions do not hold is left undone and reported.

## Functional Requirements

### post-merge-cleanup::REQ-001 What follows every merge

Applies to every merge of a pull request by the agent, whether the user approved it or [risk-tiers::REQ-006](risk-tiers.md) had the agent merge. The main checkout is the first one `git worktree list` names.

- post-merge-cleanup::REQ-001/AC-01: The agent does each step of this spec without first asking the user whether to do it. A step this spec says is not done, or whose command fails, is left undone, and the other steps are still done.
- post-merge-cleanup::REQ-001/AC-02: It deletes the pull request's remote branch.
- post-merge-cleanup::REQ-001/AC-03: Where the main checkout is on the default branch and `git status --porcelain` prints nothing there, the agent runs `git pull --ff-only` in it. A main checkout that is on the pull request's branch, with a status that prints nothing, is first switched to the default branch. In every other case the main checkout is not pulled, its branch is not switched, and no change in it is stashed, discarded or overwritten.
- post-merge-cleanup::REQ-001/AC-04: Where a local branch of the pull request's name exists and its head is the commit that was the pull request's head when it merged, the agent deletes that branch. Where the branch has a worktree, the worktree is removed first, without force, and only where `git status --porcelain --untracked-files=all` prints nothing in it. Where the branch's head is another commit, or that status prints anything, neither the branch nor the worktree is deleted.
- post-merge-cleanup::REQ-001/AC-05: The agent's report to the user names the branches and worktrees it deleted, the commit the main checkout is on, and each step it did not do with the reason.

### post-merge-cleanup::REQ-002 What follows the last merge of a piece of work

A piece of work is the change a pull request belongs to; where the change was cut into tickets, it is the whole goal those tickets belong to. Its last pull request is the closeout ticket's where tickets were cut, and the change's own where none were.

- post-merge-cleanup::REQ-002/AC-01: After the last pull request of a piece of work has merged, the agent deletes the other local branches the work made that will not be merged, such as drafts, superseded approaches and experiments, together with their worktrees.
- post-merge-cleanup::REQ-002/AC-02: Such a branch is deleted only where all three of these hold. The agent can point to having made it in this session for this work, or the work's tickets or working records say it was made for this work. Its worktree, where it has one, has a status that prints nothing, as in post-merge-cleanup::REQ-001/AC-04. For every commit on it that the default branch lacks, the agent can say which merged pull request took its content into the default branch, or which change superseded it.
- post-merge-cleanup::REQ-002/AC-03: A closeout that opens no pull request ([closeout-path::REQ-002/AC-03](closeout-path.md)) has no merge to follow. It does post-merge-cleanup::REQ-002/AC-01 and gives the report of post-merge-cleanup::REQ-001/AC-05 before it reports its conclusion.

## Failure modes and boundaries

1. **The main checkout holds an uncommitted change or an untracked file, or is on a branch that is neither the default branch nor the pull request's**, a detached head included (post-merge-cleanup::REQ-001/AC-03).
2. **The pull request's local branch got a commit after the head that merged** (post-merge-cleanup::REQ-001/AC-04).
3. **The pull request's worktree holds an uncommitted change or an untracked file** (post-merge-cleanup::REQ-001/AC-04).
4. **A draft branch holds a commit whose content no merged pull request carries and no change superseded** (post-merge-cleanup::REQ-002/AC-02).
5. **A branch or worktree was made by another session or by the user, and no ticket or working record of the work names it** (post-merge-cleanup::REQ-002/AC-02).
6. **The remote branch is already gone**, as where the host deletes a merged branch itself. The command of post-merge-cleanup::REQ-001/AC-02 fails, which post-merge-cleanup::REQ-001/AC-01 and post-merge-cleanup::REQ-001/AC-05 cover.
7. **A worktree that is removed holds files git ignores.** They are deleted with it: the status of post-merge-cleanup::REQ-001/AC-04 does not list them.

## Implementation Decisions

- The steps are a section of `/github-ops`, the skill loaded for a merge. `/implement`'s closeout path points to that section for a closeout that merges nothing.

## Out of Scope

- Branches and worktrees of other work. Nothing looks for them: the first condition of post-merge-cleanup::REQ-002/AC-02 cannot be shown for them.
- Remote branches other than the merged pull request's.
