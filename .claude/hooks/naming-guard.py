#!/usr/bin/env python3
"""PreToolUse guard: Claude names branches and commits by the repo convention.

Branches: <type>/<kebab-case>, e.g. feat/children-crud, fix/login-cookie.
Commits: Conventional Commits, e.g. "feat: add children crud", "fix(auth): ...".
No commits on master/main.
Checked before the command runs, so a bad name never reaches git. Husky
(.husky/, commitlint) checks the same rules at commit time for everyone else.
"""
import json
import re
import shlex
import subprocess
import sys

BRANCH_TYPES = "feat|fix|chore|refactor|docs|test|ci|perf|build|style|hotfix"
BRANCH_RE = re.compile(rf"^({BRANCH_TYPES})/[a-z0-9._-]+$")
# Same types as @commitlint/config-conventional.
COMMIT_TYPES = "build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test"
COMMIT_RE = re.compile(rf"^({COMMIT_TYPES})(\([a-z0-9._/-]+\))?!?: \S")
PROTECTED = {"master", "main"}
GLOBAL_OPTS_WITH_ARG = {"-C", "-c", "--git-dir", "--work-tree", "--namespace"}
BRANCH_READ_FLAGS = {"-d", "-D", "--delete", "-l", "--list", "-a", "--all", "-r", "--remotes",
                     "-v", "-vv", "--verbose", "--show-current", "--contains", "--merged",
                     "--no-merged", "-u", "--set-upstream-to", "--unset-upstream", "--edit-description"}
BRANCH_MOVE_FLAGS = {"-m", "-M", "--move"}
# git commit -m "$(cat <<'EOF' ... EOF)" - the usual way Claude writes multi-line messages.
HEREDOC_RE = re.compile(r"<<-?\s*['\"]?(\w+)['\"]?\n(.*?)\n\s*\1\b", re.S)


def deny(reason):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason + " (naming-guard hook)",
    }}))
    sys.exit(0)


def check_branch(name):
    if not BRANCH_RE.match(name):
        deny(f"Bad branch name '{name}'. Use <type>/<kebab-case>, e.g. feat/children-crud; "
             f"types: {BRANCH_TYPES.replace('|', ' ')}")


def check_subject(message):
    subject = message.strip().splitlines()[0] if message.strip() else ""
    if not COMMIT_RE.match(subject):
        deny(f"Bad commit message '{subject}'. Use Conventional Commits: <type>(<scope>)?: <subject>, "
             f"e.g. 'feat: add children crud'; types: {COMMIT_TYPES.replace('|', ' ')}")
    text = subject.split(": ", 1)[1]
    if text[0].isupper():
        deny(f"Commit subject '{text}' must start lowercase")
    if len(subject) > 100 or subject.endswith("."):
        deny("Commit header must be at most 100 characters and not end with a period")


def current_branch(cwd):
    try:
        out = subprocess.run(["git", "-C", cwd or ".", "symbolic-ref", "--short", "-q", "HEAD"],
                             capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        return ""
    return out.stdout.strip()


def commands(command):
    # Quote-aware split on shell operators: "fix(auth): x" and -m "$(cat <<EOF ...)"
    # stay one token, unlike the regex split in git-guard.py.
    lex = shlex.shlex(command, posix=True, punctuation_chars="();<>|&\n")
    lex.whitespace = " \t\r"
    lex.whitespace_split = True
    try:
        tokens = list(lex)
    except ValueError:
        tokens = command.split()
    current = []
    for tok in tokens + [";"]:
        if tok and set(tok) <= set("();<>|&\n"):
            while current and re.match(r"^\w+=", current[0]):  # FOO=bar git ...
                current.pop(0)
            if current:
                yield current
            current = []
        else:
            current.append(tok)


def option_value(args, short, long):
    # -m "x" / -m"x" / --message "x" / --message=x
    for i, a in enumerate(args):
        if a in (short, long) and i + 1 < len(args):
            return args[i + 1]
        if a.startswith(long + "="):
            return a.split("=", 1)[1]
        if short and a.startswith(short) and len(a) > len(short) and not a.startswith("--"):
            return a[len(short):]
    return None


def check_git(args, cwd, heredoc_message):
    i = 0
    while i < len(args) and args[i].startswith("-"):
        i += 2 if args[i] in GLOBAL_OPTS_WITH_ARG else 1
    if i >= len(args):
        return
    sub, rest = args[i], args[i + 1:]
    if sub == "commit":
        branch = current_branch(cwd)
        if branch in PROTECTED:
            deny(f"No commits on {branch}; create a branch first, e.g. git switch -c feat/<name>")
        message = option_value(rest, "-m", "--message")
        if message is not None and not message.startswith("$("):
            check_subject(message)
        elif heredoc_message is not None:
            check_subject(heredoc_message)
    elif sub == "checkout":
        name = option_value(rest, "-b", "") or option_value(rest, "-B", "")
        if name:
            check_branch(name)
    elif sub == "switch":
        name = option_value(rest, "-c", "--create") or option_value(rest, "-C", "--force-create")
        if name:
            check_branch(name)
    elif sub == "branch":
        positional = [a for a in rest if not a.startswith("-")]
        if any(a in BRANCH_MOVE_FLAGS for a in rest) and positional:
            check_branch(positional[-1])
        elif positional and not any(a in BRANCH_READ_FLAGS or a.startswith("--format") for a in rest):
            check_branch(positional[0])
    elif sub == "worktree" and rest[:1] == ["add"]:
        name = option_value(rest, "-b", "") or option_value(rest, "-B", "")
        if name:
            check_branch(name)


def main():
    data = json.load(sys.stdin)
    command = (data.get("tool_input") or {}).get("command", "")
    heredoc = HEREDOC_RE.search(command)
    heredoc_message = heredoc.group(2) if heredoc else None
    for tokens in commands(command):
        if tokens[0].rsplit("/", 1)[-1] == "git":
            check_git(tokens[1:], data.get("cwd"), heredoc_message)


if __name__ == "__main__":
    main()
