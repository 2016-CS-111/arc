# Infrastructure

Local infrastructure manifests live here when a milestone needs them.

Milestone 2.5 adds PostgreSQL 16 for durable chat sessions. It listens on `127.0.0.1:5433` by
default to avoid conflicting with a locally installed PostgreSQL instance.

```sh
pnpm db:up
pnpm db:migrate
```

The default development database is `arc` with the username and password `arc`. `pnpm db:down`
stops the container while keeping its named volume; it does not remove conversation data.
