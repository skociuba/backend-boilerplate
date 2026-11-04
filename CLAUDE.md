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

## Git — local only

- Claude does local git only: status, diff, log, branch, commit. **Never** push, fetch, pull,
  open PRs, or contact GitHub/GitLab — the user does all remote work. Enforced by
  `.claude/hooks/git-guard.py`.
- Branches: `<type>/<kebab-case>`, e.g. `feat/children-crud`, `fix/login-cookie`.
  Types: feat fix chore refactor docs test ci perf build style hotfix.
  Never commit on `master`.
- Commits: Conventional Commits (`feat: ...`, `fix(auth): ...`), lowercase subject.
  Enforced by husky + commitlint (`.husky/`, `commitlint.config.js`). Never `--no-verify`.
- Pushing `deploy` deploys to production (`.github/workflows/deploy.yaml`).

## Rules

- Never read or edit `.env` — use `.env.example` for variable names (`secrets-guard.py`).
- Migrations: never edit an applied migration in `prisma/migrations/`; create a new one.
- Code comments in this repo are in Polish and explain *why*; keep that style.
- Verify behaviour (run it, curl it, run tests) before stating it as fact.
