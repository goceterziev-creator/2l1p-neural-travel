# GT63 Backlog

Version: 1.0

This backlog captures future ideas that are useful but not ready for implementation.

The goal is to preserve architectural direction without starting work before production data justifies it.

## Future Idea — V10.28 Site Layout Resolver

Status:
PARKED

Reason:
Good architecture direction, but too early.

Current priority:
Use Beta Dashboard data to identify and reduce the largest measured review bottleneck.

Do not implement until:

- enough real regression cases exist per provider/layout
- dashboard shows repeated layout-specific failures
- shadow detection can be validated without changing production parsing

Future rollout:

- V10.28A — Layout Detection Shadow Only
- V10.28B — Layout Metrics
- V10.28C — Layout-assisted Parser

GT63 rule:
PRODUCTION DATA BEFORE ARCHITECTURE.
