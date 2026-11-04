#!/usr/bin/env python3
"""PreToolUse guard: Claude never reads or edits real .env files.

Secrets (DB password, JWT secret, SMTP) would otherwise land in the model's
context. File tools are blocked by permissions.deny in settings.json; this
covers Bash (cat .env, grep X .env, source .env ...). .env.example is fine.
"""
import json
import re
import shlex
import sys

SECRET_ENV_RE = re.compile(r"(^|/)\.env(\.(?!example)[\w.-]+)?$")


def main():
    command = (json.load(sys.stdin).get("tool_input") or {}).get("command", "")
    lex = shlex.shlex(command, posix=True, punctuation_chars=True)
    lex.whitespace_split = True
    try:
        tokens = list(lex)
    except ValueError:
        tokens = command.split()
    for tok in tokens:
        if SECRET_ENV_RE.search(tok.split("=")[-1]):
            print(json.dumps({"hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": f"{tok} holds secrets; use .env.example for variable names (secrets-guard hook)",
            }}))
            return


if __name__ == "__main__":
    main()
