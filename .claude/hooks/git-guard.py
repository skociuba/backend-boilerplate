#!/usr/bin/env python3
"""PreToolUse guard: Claude may read remotes but never write to them.

Commit/branch naming is enforced locally by naming-guard.py and .husky/.
Allowed: git fetch/ls-remote/clone, reading GitHub/GitLab (WebFetch, curl GET),
read-only gh/glab (view, list, diff, ...), curl POST to localhost (API testing).
Blocked: anything that changes a remote or ships code out:
- git push/pull/send-email/lfs push, remote changes, git config remote.*,
  --no-verify (skips the husky hooks),
- gh/glab other than reads, gh api, curl/wget writes to GitHub/GitLab,
- npm/yarn/pnpm/bun publish, docker/podman push, ssh/scp/sftp/ftp, rsync to a host.
Commands wrapped in bash -c "...", eval "...", $(...), backticks, sudo, env,
xargs, timeout ... are checked too (same rules as the company repo's git-guard).
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
PACKAGE_MANAGERS = {"npm", "yarn", "pnpm", "bun"}
CONTAINER_CLIS = {"docker", "podman"}
REMOTE_SHELLS = {"ssh", "scp", "sftp", "ftp", "lftp"}
# Prefixes that run the next word as a command: sudo git push, xargs git push ...
WRAPPERS = {"sudo", "env", "command", "exec", "time", "nohup", "xargs", "nice", "watch", "timeout", "builtin"}
SHELL_OPERATORS = "();<>|&\n"
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
    # Quote-aware split on shell operators; backticks become separators.
    lex = shlex.shlex(command.replace("`", " ; "), posix=True, punctuation_chars=SHELL_OPERATORS)
    lex.whitespace = " \t\r"
    lex.whitespace_split = True
    try:
        tokens = list(lex)
    except ValueError:
        tokens = command.split()
    current = []
    for tok in tokens + [";"]:
        if tok and set(tok) <= set(SHELL_OPERATORS):
            if current:
                yield current
            current = []
        else:
            current.append(tok)


def strip_prefix(tokens):
    # FOO=bar git ..., sudo -u x git ..., timeout 5 git ..., "$" left over from $(...)
    while tokens and (tokens[0] in WRAPPERS or tokens[0] == "$" or re.match(r"^\w+=", tokens[0])
                      or tokens[0].startswith("-") or tokens[0].isdigit()):
        tokens = tokens[1:]
    return tokens


def check_git(args):
    i = 0
    while i < len(args) and args[i].startswith("-"):
        i += 2 if args[i] in GLOBAL_OPTS_WITH_ARG else 1
    if i >= len(args):
        return
    sub, rest = args[i], args[i + 1:]
    if sub in WRITE_SUBCOMMANDS:
        deny(f"git {sub} changes a remote or merges into the user's branch")
    if sub == "lfs" and "push" in rest:
        deny("git lfs push uploads to a remote")
    if sub == "remote" and rest and rest[0] in REMOTE_EDIT:
        deny(f"git remote {rest[0]} changes remotes")
    if sub == "config" and any("remote." in a for a in rest) and not any(
            a in {"--get", "--get-all", "--list", "-l"} for a in rest):
        deny("git config remote.* changes remotes")
    if "--no-verify" in rest or (sub == "commit" and "-n" in rest):
        deny("--no-verify skips the repo's husky hooks (commitlint, branch names)")


def check_forge_cli(name, args):
    # gh pr view 12 / glab mr list / gh run view: <group> <verb> ...
    positional = [a for a in args if not a.startswith("-")]
    if len(positional) < 2 or positional[1] not in FORGE_READ_VERBS:
        deny(f"{name} {' '.join(positional[:2])} is not a read-only command")


def check_command(command, forge_mentioned):
    for tokens in commands(command):
        # bash -c "git push", eval "git push": quoted text is a command of its own
        for tok in tokens:
            if re.search(r"\s", tok):
                check_command(tok, forge_mentioned)
        tokens = strip_prefix(tokens)
        if not tokens:
            continue
        name = tokens[0].rsplit("/", 1)[-1]
        positional = [t for t in tokens[1:] if not t.startswith("-")]
        if name == "git":
            check_git(tokens[1:])
        elif name in FORGE_CLIS:
            check_forge_cli(name, tokens[1:])
        elif name in HTTP_CLIENTS and forge_mentioned and any(HTTP_WRITE_FLAGS.match(t) for t in tokens[1:]):
            deny(f"{name} with a write flag against GitHub/GitLab")
        elif name in PACKAGE_MANAGERS and "publish" in positional:
            deny(f"{name} publish uploads a package")
        elif name in CONTAINER_CLIS and (positional[:1] == ["push"] or positional[:2] == ["image", "push"]):
            deny(f"{name} push uploads an image")
        elif name in REMOTE_SHELLS:
            deny(f"{name} connects to a remote host")
        elif name == "rsync" and any(re.match(r"^([\w.@-]+:|rsync://)", t) for t in tokens[1:]):
            deny("rsync to a remote host")


def main():
    data = json.load(sys.stdin)
    if data.get("tool_name") == "WebFetch":
        return  # WebFetch only reads
    command = (data.get("tool_input") or {}).get("command", "")
    check_command(command, bool(FORGE_HOST_RE.search(command)))


if __name__ == "__main__":
    main()
