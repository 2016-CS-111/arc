# Milestone 16.4 Architecture

## Decision

Arc does not add Redis in the current single-user local product. The concurrency and recovery paths
that need durability already use PostgreSQL, and the remaining in-memory state is deliberately
short-lived or approval-sensitive.

| Workflow                             | Current owner                               | Restart behavior                                                                      |
| ------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------- |
| Conversation turns                   | PostgreSQL row lock and request correlation | Pending or streaming assistant messages become failed; no generation is replayed.     |
| Inventory and indexes                | PostgreSQL running-state constraints        | Interrupted runs become failed while the last usable catalog remains published.       |
| Agent runs                           | PostgreSQL journal                          | Running or waiting work becomes paused; no proposal, task, or Git action is replayed. |
| Active model requests                | Process-local abort controller              | The request is cancelled on disconnect or restart.                                    |
| Proposal drafts and completion cache | Process-local maps                          | They expire safely and require an explicit new user action.                           |

Queues would be incorrect for current explicit scan, index, chat, and agent actions because a restart
must not silently resume model work, file changes, commands, or Git operations. A shared cache is
also unnecessary: the local backend is single-process, query results are bounded, and durable data
already lives in PostgreSQL.

## Reconsideration

Redis becomes an explicit follow-up only after measured evidence shows one of these needs:

- More than one backend process must coordinate the same active request or project job.
- A user-visible background job needs durable retry semantics that are safe to resume.
- A repeated, expensive, read-only result has a measured reuse pattern that a bounded cache improves.

Any future Redis queue must preserve the current approval and no-replay boundaries. It cannot become
a path to resume an edit, terminal command, Git mutation, or model generation automatically.
