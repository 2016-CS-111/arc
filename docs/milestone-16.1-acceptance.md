# Milestone 16.1 Acceptance

## Automated Evidence

- Configuration defaults to the review profile and accepts the read-only profile.
- Read-only mode refuses proposal tools and direct proposal services while read-only inspection remains available.
- The shared redactor masks common credentials, authorization headers, and connection-string passwords.
- Sequelize audit persistence stores and reloads typed metadata-only event rows; the controller exposes the active profile and bounded review list.
- Tool, edit, task, and memory services emit category/action/status audit events without their underlying content.

## Manual Check

1. Set `ARC_PERMISSION_PROFILE=read_only` in `.env`, start `pnpm backend:dev`, and open Arc. Confirm inspection/chat works but Arc cannot stage an edit, task, or memory proposal.
2. Restart with `ARC_PERMISSION_PROFILE=review`. Stage and approve an edit or task, then call `curl 'http://127.0.0.1:7331/security/audit?limit=50'` and confirm the matching metadata event appears.
3. Run `pnpm security:dependencies` when package-registry network access is appropriate. Resolve high-severity production findings before distribution.

## Boundary

This gate does not add authentication, remote access, multi-user authorization, background queues,
or automatic dependency remediation. Those belong to later planned hardening and deployment gates.
