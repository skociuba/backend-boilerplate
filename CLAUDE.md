# CLAUDE.md

Backend REST API: TypeScript + Express + PostgreSQL, Prisma 7 (migration-first), Docker.
Portfolio project for job interviews — code and history should look professional.

## Commands

```sh
docker compose up -d          # db (host port 5433) + maildev (http://localhost:1080)
npm start                     # ts-node src/index.ts
npx tsc --noEmit              # typecheck
npm test                      # jest (src/tests/, Prisma mocked)
# integration tests: real Postgres, DB name must contain "test" (tables are truncated)
docker run -d --name vps2-pg-test -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=vps2_test -p 127.0.0.1:5434:5432 postgres:15
DATABASE_URL=postgres://test:test@127.0.0.1:5434/vps2_test npm run test:integration
npx prisma migrate dev --name <name>   # new migration after editing prisma/schema.prisma
npx prisma generate           # client → src/generated/prisma (gitignored)
```

## Git — read remotes, never write them

- Claude may read remotes: `git fetch`, `ls-remote`, GitHub/GitLab pages, read-only `gh`/`glab`.
- **Never** write to them: push, pull, open/merge PRs, `gh api`, change remotes — the user
  does all of that. Enforced by `.claude/hooks/git-guard.py`.
- Branches: `<type>/<desc>`, `<type>-<ticket>/<desc>` or `<type>/<ticket>/<desc>`,
  e.g. `feat/children-crud`, `feat-26998/history-krakow`.
  Types: feat fix chore refactor ci docs test perf style build revert hotfix.
  Never commit on `master`/`main`.
- New branches never track a remote branch: from `origin/...` only with `--no-track`, no `--track`,
  no upstream on `origin/master` (git-guard.py). `branch.autoSetupMerge=false` is set in every home repo;
  the user sets the upstream on the first push (`git push -u origin <branch>`).
- Commits: Conventional Commits (`feat: ...`, `fix(auth): [28917] ...`); prefer a lowercase subject.
- Both checked before the command runs by `.claude/hooks/naming-guard.py` (same rules as the
  company repo). Husky enforces the same rules for every commit: pre-commit (branch name, no
  commits on master), commit-msg (commitlint, `commitlint.config.js`), pre-push (branch rules +
  `tsc` + unit tests). The frontend repo has the same hooks. Never `--no-verify`.
- Production deploys only from releases (continuous delivery): merging to `master` runs
  `.github/workflows/ci.yml` (test, integration, build → image `:<sha>`), and release-please
  keeps a "chore(master): release X.Y.Z" PR open. Merging THAT PR tags `vX.Y.Z`, retags the image
  `:X.Y.Z` + `:latest` and deploys it (`release.yml` → `deploy.yml`). Redeploy/rollback:
  Actions → "Deploy Backend" → Run workflow → version. The old `deploy` branch is no longer used.
- Every PR to `master` runs `test`, `integration` and `build` (image built, not pushed);
  branch protection on `master` requires them to pass before merge.

## Rules

- Never read or edit `.env` — use `.env.example` for variable names (`secrets-guard.py`).
- Migrations: never edit an applied migration in `prisma/migrations/`; create a new one.
- Code comments in this repo are in Polish and explain *why*; keep that style.
- Verify behaviour (run it, curl it, run tests) before stating it as fact.
