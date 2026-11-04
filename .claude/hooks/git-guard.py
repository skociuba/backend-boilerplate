#!/usr/bin/env python3
"""PreToolUse guard: Claude may read remotes but never write to them.

Commit/branch naming is enforced locally by .husky/ (commitlint, branch-name.sh).
Allowed: git fetch/ls-remote/clone, reading GitHub/GitLab (WebFetch, curl GET),
read-only gh/glab (view, list, diff, ...).
Blocked: anything that changes a remote (push, PR/MR create/merge, gh api,
curl POST, remote set-url), git pull (merges into the user's branch - their call),
and --no-verify (skips the husky hooks).
"""
import json
import re
import shlex
import sys

WRITE_SUBCOMMANDS = {"push", "pull", "submodule", "request-pull", "send-email"}
REMOTE_EDIT = {"add", "set-url", "rename", "remove", "rm", "prune", "update", "set-head"}
FORGE_CLIS = {"gh", "glab", "hub"}
FORGE_READ_VERBS = {"view", "list", "status", "diff", "checks", "browse"}
HTTP_CLIENTS = {"curl", "wget", "http", "https", "xh"}
HTTP_WRITE_FLAGS = re.compile(r"^(-X|--request|-d|--data.*|-F|--form.*|-T|--upload-file|--json|--post-.*|--method)$")
FORGE_HOST_RE = re.compile(r"(github|gitlab)(usercontent)?\.com", re.I)
# git global options that take a separate value: git -C <dir> push ...
GLOBAL_OPTS_WITH_ARG = {"-C", "-c", "--git-dir", "--work-tree", "--namespace"}


def deny(reason):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason + ". Writing to remotes is the user's job (git-guard hook)",
    }}))
    sys.exit(0)


def commands(command):
    # Rough split on shell operators; good enough for "cd x && git push".
    for segment in re.split(r"&&|\|\||;|\||\n|\$\(|\)|`", command):
        try:
            tokens = shlex.split(segment)
        except ValueError:
            tokens = segment.split()
        while tokens and re.match(r"^\w+=", tokens[0]):  # FOO=bar git ...
            tokens.pop(0)
        if tokens:
            yield tokens


def check_git(args):
    i = 0
    while i < len(args) and args[i].startswith("-"):
        i += 2 if args[i] in GLOBAL_OPTS_WITH_ARG else 1
    if i >= len(args):
        return
    sub, rest = args[i], args[i + 1:]
    if sub in WRITE_SUBCOMMANDS:
        deny(f"git {sub} changes a remote or merges into the user's branch")
    if sub == "remote" and rest and rest[0] in REMOTE_EDIT:
        deny(f"git remote {rest[0]} changes remotes")
    if "--no-verify" in rest or (sub == "commit" and "-n" in rest):
        deny("--no-verify skips the repo's husky hooks (commitlint, branch names)")


def check_forge_cli(name, args):
    # gh pr view 12 / glab mr list / gh run view: <group> <verb> ...
    positional = [a for a in args if not a.startswith("-")]
    if len(positional) < 2 or positional[1] not in FORGE_READ_VERBS:
        deny(f"{name} {' '.join(positional[:2])} is not a read-only command")


def main():
    data = json.load(sys.stdin)
    if data.get("tool_name") == "WebFetch":
        return  # WebFetch only reads
    command = (data.get("tool_input") or {}).get("command", "")
    forge_mentioned = bool(FORGE_HOST_RE.search(command))
    for tokens in commands(command):
        name = tokens[0].rsplit("/", 1)[-1]
        if name == "git":
            check_git(tokens[1:])
        elif name in FORGE_CLIS:
            check_forge_cli(name, tokens[1:])
        elif name in HTTP_CLIENTS and forge_mentioned and any(HTTP_WRITE_FLAGS.match(t) for t in tokens[1:]):
            deny(f"{name} with a write flag against GitHub/GitLab")


if __name__ == "__main__":
    main()
