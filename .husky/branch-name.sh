# Wspólna reguła nazw branchy dla pre-commit i pre-push (source, nie exec).
# Użycie: check_branch_name <nazwa> → exit 1 z komunikatem, jeśli zła.

BRANCH_PATTERN='^(feat|fix|chore|refactor|docs|test|ci|perf|build|style|hotfix)/[a-z0-9._-]+$'
# deploy: push na niego = deploy na VPS (patrz .github/workflows/deploy.yaml).
# prisma-experiment, lern-BE: stare branche sprzed konwencji — usunąć z listy, gdy znikną.
BRANCH_EXCEPTIONS="deploy prisma-experiment lern-BE"

check_branch_name() {
  for ok in $BRANCH_EXCEPTIONS; do
    [ "$1" = "$ok" ] && return 0
  done
  if ! echo "$1" | grep -Eq "$BRANCH_PATTERN"; then
    echo "✖ Zła nazwa brancha: '$1'"
    echo "  Wymagany format: <typ>/<opis-małymi-literami>, np. feat/children-crud, fix/login-cookie"
    echo "  Typy: feat fix chore refactor docs test ci perf build style hotfix"
    echo "  Zmiana nazwy: git branch -m <nowa-nazwa>"
    return 1
  fi
}
