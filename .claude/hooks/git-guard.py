#!/usr/bin/env python3
"""PreToolUse guard: Claude works on the local repo only.

Commit/branch naming is enforced locally by .husky/ (commitlint, branch-name.sh).
Claude gets no access to remotes at all: no push/fetch/pull/clone, no gh/glab,
no requests to GitHub/GitLab. Everything that leaves this machine is the user's call.
Claude also may not skip the husky hooks with --no-verify.
"""
import json
import re
import shlex
import sys

REMOTE_SUBCOMMANDS = {"push", "fetch", "pull", "clone", "ls-remote", "submodule", "request-pull"}
REMOTE_EDIT = {"add", "set-url", "rename", "remove", "rm", "prune", "update", "set-head"}
FORGE_CLIS = {"gh", "glab", "hub"}
FORGE_HOST_RE = re.compile(r"(github|gitlab)(usercontent)?\.com", re.I)
# git global options that take a separate value: git -C <dir> push ...
GLOBAL_OPTS_WITH_ARG = {"-C", "-c", "--git-dir", "--work-tree", "--namespace"}


def deny(reason):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason + ". Remote operations are the user's job (git-guard hook)",
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
    if sub in REMOTE_SUBCOMMANDS:
        deny(f"git {sub} talks to a remote")
    if sub == "remote" and rest and rest[0] in REMOTE_EDIT:
        deny(f"git remote {rest[0]} changes remotes")
    if "--no-verify" in rest or (sub == "commit" and "-n" in rest):
        deny("--no-verify skips the repo's husky hooks (commitlint, branch names)")


def main():
    data = json.load(sys.stdin)
    tool = data.get("tool_name")
    inp = data.get("tool_input") or {}

    if tool == "WebFetch":
        if FORGE_HOST_RE.search(inp.get("url", "")):
            deny("WebFetch to GitHub/GitLab")
        return

    command = inp.get("command", "")
    if FORGE_HOST_RE.search(command):
        deny("Command mentions a GitHub/GitLab host (curl, ssh, git URL)")
    for tokens in commands(command):
        name = tokens[0].rsplit("/", 1)[-1]
        if name in FORGE_CLIS:
            deny(f"{name} CLI talks to GitHub/GitLab")
        if name == "git":
            check_git(tokens[1:])


if __name__ == "__main__":
    main()
