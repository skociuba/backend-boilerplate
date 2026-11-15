// Conventional Commits: "feat: ...", "fix(auth): [28917] ...", "chore: ..." itd.
// Typy i luźniejszy opis jak w repo firmowym i w .claude/hooks/naming-guard.py —
// opis może zaczynać się wielką literą ("fix: [16936] Obsługa printout").
// Używany tylko przez .husky/commit-msg (na razie wyłączony).
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "chore", "refactor", "ci", "docs", "test", "perf", "style", "build", "revert", "hotfix"],
    ],
    "subject-case": [0],
  },
};
