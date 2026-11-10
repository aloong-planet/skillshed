# Specs

Persistent specs of confirmed requirements for these skills; one-off working records live in `docs/.workings/`, not here.

## Index

| Spec | In one line |
|---|---|
| [Post-implementation review: one independent pass](post-implementation-check.md) | What the one independent review covers, what it hands back, and what the main agent does with its findings |
| [Closeout path](closeout-path.md) | How a closeout ticket runs, and the check of the statements it writes into the repository |
| [Project documents](project-documents.md) | What a project's specs hold, when a prototype is required, what tests a change needs, and how the closing document check is handed to a sub-agent |
| [Delivery flow](delivery-flow.md) | Which runs happen for a change, what goes to sub-agents once the review is handled, and what is written down |

## Invariants

- One spec per module, kept as a current description and rewritten in place; history lives in git.
- A spec names no ticket, branch or working-record path; behaviour not yet built is marked with a `Pending:` note that can be judged against the implementation.
