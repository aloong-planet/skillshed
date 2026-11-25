# CI watch

> Related: [delivery-flow](delivery-flow.md) · `/github-ops` ([ci-watch.md](../../github-ops/ci-watch.md), [delivery.md](../../github-ops/delivery.md), [watch-ci.sh](../../github-ops/watch-ci.sh))

## Problem Statement

An agent that waits for the CI of a commit reports a verdict: every run succeeded, or one did not. The wait takes the repository and the commit from the directory it is started in. Started in another checkout, it watches that checkout's commit, and its verdict reads the same as one for the commit that was meant.

## Solution

The wait is started inside the checkout it is meant for, and its verdict counts only once its own output shows that it watched the commit or the run that was meant.

## Functional Requirements

### ci-watch::REQ-001 A verdict belongs to the commit that was meant

Applies to every wait for the CI made with the watch script of `/github-ops`, whoever starts it: an agent for itself, a sub-agent sent to watch, or the delivery sub-agent of [delivery-flow::REQ-002/AC-03](delivery-flow.md). The wait is for a commit, the head of the checkout, or for a run named by its id.

- ci-watch::REQ-001/AC-01: The command that starts the wait enters the checkout itself, in the same call, and does not rely on the directory an earlier call left. Where the checkout cannot be entered, the command ends with exit code 2, the code of a script error, and not with 1, the code of a run that did not succeed.
- ci-watch::REQ-001/AC-02: An exit code of 0 or 1 counts as the verdict for the commit that was meant only where the first line of the wait's output names a commit whose abbreviated hash is the beginning of that commit's full hash. For a wait on a named run, the line names that run's id. Where the line names another commit or run, neither the conclusions nor the exit code are used.
- ci-watch::REQ-001/AC-03: A sub-agent sent to watch hands back the first line of the wait's output, together with the exit code and the conclusions. The agent that sent it uses the exit code only after that line passes AC-02 for the commit or run it named in the handoff.
- ci-watch::REQ-001/AC-04: Where the line fails AC-02 in the handback and again in the wait's output file when the sending agent reads it, the sending agent does not judge by that file: it sends a sub-agent again, and where that handback fails AC-02 too, it runs the wait itself.
- ci-watch::REQ-001/AC-05: The commands with which the sub-agent sent to watch reads a run that did not succeed are run inside the checkout too, entered in the same call.

## Failure modes and boundaries

1. **The wait is started from another checkout of the same repository**, as where a sub-agent's shell starts every call in the main session's directory while the change is in a worktree. The wait watches that checkout's head and can end with exit code 0 (ci-watch::REQ-001/AC-02).
2. **The checkout that was named does not exist.** The command ends with exit code 2 (ci-watch::REQ-001/AC-01).
3. **The wait ends with exit code 2.** There is no verdict, and the first line may be an error message; ci-watch::REQ-001/AC-02 does not apply.

## Out of Scope

- A check that the sub-agents of the independent review, the closing document check and the evidence gathering work inside the checkout they were handed. Their documents give them no command line to copy.
- The repository the wait resolves where a checkout's remotes point at more than one repository, as in a fork.
