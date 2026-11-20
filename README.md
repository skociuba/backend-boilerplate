# VPS2 — Backend API

REST API for a small blogging app: accounts with email verification, posts with tags and images,
user profiles and an admin role. TypeScript, Express 5, PostgreSQL and Prisma 7, running in Docker on
a VPS with automated releases, encrypted offsite backups and error tracking.

**Live:** [app](https://skociuba-vps2.duckdns.org/vps2) ·
[API health](https://skociuba-vps2.duckdns.org/api-node/health) ·
[status page](https://stats.uptimerobot.com/BinXvsm3RH) ·
frontend repo: [boilerplate-next-for-postgresql](https://github.com/skociuba/boilerplate-next-for-postgresql)

## Highlights

- **Auth done properly** — short-lived JWT access token plus a refresh token in an `HttpOnly; Secure;
SameSite` cookie. Refresh tokens are single-use (rotated on every refresh) and stored only as
  hashes; logout, "log out everywhere" and a password reset revoke them. Passwords are hashed with
  bcrypt. Email verification and password reset use one-time tokens.
- **Abuse protection** — rate limits on login, registration and password reset; request bodies
  validated with Zod; one error handler maps Prisma errors to HTTP statuses and never leaks internals.
  Security headers on every response (helmet; HSTS at nginx).
- **Migration-first database** — schema changes go through Prisma migrations, applied by the deploy
  _before_ the new version starts.
- **Tested on two levels** — unit tests with Prisma mocked, and integration tests that run the real
  app against a real PostgreSQL built from the migrations.
- **Continuous delivery** — every merge builds and scans an image; production only runs tagged
  releases, deployed after a manual approval, with one-click rollback.
- **Operations** — encrypted offsite backups with a weekly automated restore test, health checks,
  uptime monitoring, Sentry and structured logs.

## Architecture

```mermaid
flowchart LR
  user([Browser]) -->|HTTPS| nginx
  subgraph VPS [VPS · Docker]
    nginx[nginx + Let's Encrypt]
    nginx -->|/vps2| fe[Next.js frontend]
    nginx -->|/api-node| api[Express API]
    fe -->|/api-proxy| api
    api --> db[(PostgreSQL)]
    api --> files[(uploads volume)]
  end
  api -. errors .-> sentry[Sentry]
  backup[backup-db.sh · daily cron] -->|age-encrypted| b2[(Backblaze B2)]
  ghrestore[GitHub Actions · weekly] -->|restore test| b2
  uptime[UptimeRobot] -->|every 5 min| nginx
```

The server configuration (Docker, nginx, certificates, backup setup) is code: see the
[Ansible playbook](https://github.com/skociuba/boilerplate-next-for-postgresql/tree/master/ansible)
in the frontend repo.

## Tech stack

| Area       | Tools                                                                         |
| ---------- | ----------------------------------------------------------------------------- |
| Runtime    | Node.js 22, TypeScript, Express 5                                             |
| Data       | PostgreSQL 15, Prisma 7 (migrations, generated client)                        |
| Auth       | JWT (access + rotated refresh tokens), bcrypt, express-rate-limit, Zod        |
| Email      | Nodemailer over SMTP (MailDev locally)                                        |
| Testing    | Jest, ts-jest; integration tests against a real database                      |
| Quality    | ESLint 9 (typescript-eslint), husky + commitlint                              |
| Delivery   | Docker, GitHub Actions, release-please, Trivy, Docker Hub                     |
| Operations | nginx, Let's Encrypt, Ansible, age + rclone → Backblaze B2, Sentry, pino logs |

## Delivery pipeline

1. **Pull request** — `test` (typecheck, lint, unit tests, dependency audit), `integration` (real
   PostgreSQL) and `build` (production image + Trivy scan). Branch protection requires all three.
2. **Merge to `master`** — the image is pushed as `:<commit-sha>`. release-please keeps a release PR
   open with the next version and changelog, derived from Conventional Commits.
3. **Merge the release PR** — tags `vX.Y.Z`, retags the already scanned image as `:X.Y.Z` and
   `:latest`, then deploys it. The deploy waits for approval in the `production` environment.
4. **Deploy** ([deploy.yml](.github/workflows/deploy.yml)) — backup → pull → `prisma migrate deploy`
   on the running database → restart → wait until the container reports `healthy`.
5. **Rollback** — Actions → "Deploy Backend" → run with an older version, or
   [scripts/rollback.sh](scripts/rollback.sh) on the server.

Git hooks (husky) check branch names and commit messages and run lint, the type check and unit
tests before a push.

## Operations

- **Backups** ([scripts/backup-db.sh](scripts/backup-db.sh)) — database dump and uploaded files before
  every deploy and daily from cron. Encrypted with [age](https://age-encryption.org) using a public
  key (the server cannot decrypt old backups) and uploaded to Backblaze B2 with a write-only key.
- **Restore test** ([backup-restore-test.yml](.github/workflows/backup-restore-test.yml)) — every
  week GitHub Actions downloads the latest backup, decrypts it, restores it into an empty PostgreSQL
  and checks the data. A backup nobody has restored is only a hope.
- **Health** — `GET /health` checks the database too; Docker, the deploy and UptimeRobot use it.
- **Errors** — unexpected errors (500s, failed emails, crashes) go to Sentry, tagged with the
  release. Cookies, headers and request bodies are not sent.
- **Logs** — one JSON line per request (pino) with a request ID, also returned as `X-Request-Id`.
  Auth headers and cookies are redacted. Docker caps logs at 3 × 10 MB per container.

## API

Public: reading posts, the tag list, registration and login. Everything else needs an access token;
user management is admin-only.

| Area     | Endpoints                                                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth     | `POST /auth/register` · `/verify-email` · `/login` · `/refresh` · `/logout` · `/logout-all` · `/forgot-password` · `/reset-password` · `GET /auth/me` |
| Posts    | `GET /posts` (search `q`, `tagId`, `sortBy`/`order`, `page`/`limit`) · `GET /posts/:id` · `POST /posts` · `PUT`/`DELETE /posts/:id`                   |
|          | `PUT`/`DELETE /posts/:id/image` · `PUT /posts/:id/tags` · `GET /users/:id/posts`                                                                      |
| Tags     | `GET /tags` · `GET /tags/:id` · `POST /tags` · `PUT /tags/:id` · `DELETE /tags/:id`                                                                   |
| Users    | admin: `GET /users` · `GET /users/:id` · `POST /users` (sends an account setup email) · `PUT`/`DELETE /users/:id` · `POST /usersTransaction`          |
| Profiles | `GET`/`PUT /users/:id/profile` · avatar upload `/profile/avatar` (public image) · document upload `/profile/document` (private)                       |
| Children | `GET /children` · `POST /children`                                                                                                                    |
| Health   | `GET /health` (app and database)                                                                                                                      |

## Running locally

Requirements: Node.js 22 and Docker.

```sh
cp .env.example .env              # fill in the JWT secrets; the file explains each variable
docker compose up -d db maildev   # PostgreSQL on port 5433, MailDev on http://localhost:1080
npm install
npx prisma migrate dev            # create the schema from the migrations
npx prisma generate               # generate the Prisma client (src/generated, not committed)
npm start                         # API on http://localhost:3000
```

For local emails set `SMTP_HOST=localhost` and `SMTP_PORT=1025` in `.env`: activation and password
reset emails then appear in MailDev at http://localhost:1080. To make an account an admin:
`npm run make-admin -- <email>`.

### Tests

```sh
npm test                          # unit tests (Prisma mocked), no database needed
npm run lint                      # ESLint
npx tsc --noEmit                  # typecheck

# integration tests: real PostgreSQL; the database name must contain "test" (tables get truncated)
docker run -d --name vps2-pg-test -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=vps2_test -p 127.0.0.1:5434:5432 postgres:15
DATABASE_URL=postgres://test:test@127.0.0.1:5434/vps2_test npm run test:integration
```

## Project structure

```
src/
  app.ts              Express app (middleware, routes, error handler) — used by tests too
  index.ts            server start and graceful shutdown
  instrument.ts       Sentry setup
  routes/             route definitions, per resource
  controllers/        request handlers
  middleware/         auth (current user, admin), validation, rate limits, errors
  lib/                JWT, passwords, mailer, uploads, logger, error classes
  tests/              unit tests; tests/integration/ runs against a real database
prisma/               schema and migrations
scripts/              backup, rollback and health-wait scripts used on the server
.github/workflows/    CI, release, deploy, weekly backup restore test
```
