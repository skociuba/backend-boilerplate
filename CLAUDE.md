# CLAUDE.md

Backend REST API: TypeScript + Express + PostgreSQL, Prisma 7 (migration-first), Docker.
Portfolio project for job interviews — code and history should look professional.

## Commands

```sh
docker compose up -d          # db (host port 5433) + maildev (http://localhost:1080)
npm start                     # ts-node src/index.ts
npx tsc --noEmit              # typecheck
npm test                      # jest (src/tests/, Prisma mocked)
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
- Commits: Conventional Commits (`feat: ...`, `fix(auth): [28917] ...`); prefer a lowercase subject.
- Both checked before the command runs by `.claude/hooks/naming-guard.py` (same rules as the
  company repo). Husky + commitlint (`.husky/`, `commitlint.config.js`) hold the same rules for
  manual commits but are commented out for now. Never `--no-verify`.
- Pushing `deploy` deploys to production (`.github/workflows/deploy.yaml`).

## Rules

- Never read or edit `.env` — use `.env.example` for variable names (`secrets-guard.py`).
- Migrations: never edit an applied migration in `prisma/migrations/`; create a new one.
- Code comments in this repo are in Polish and explain *why*; keep that style.
- Verify behaviour (run it, curl it, run tests) before stating it as fact.
