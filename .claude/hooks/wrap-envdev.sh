#!/bin/bash
# PreToolUse hook (Bash matcher) — reroute every Bash tool command from the
# Claude Code VSCode-extension sandbox (Flatpak, no Node/pnpm on PATH) into
# the "envdev" distrobox, which is where this machine's real dev toolchain
# (nvm/node/pnpm) lives — same place VS Code's own integrated terminal lands
# by default (terminal.integrated.defaultProfile.linux: "envdev").
#
# Command is written to a temp file instead of interpolated into a quoted
# string, so heredocs/single-quotes/newlines in the original command (e.g.
# git commit -m "$(cat <<'EOF' ... EOF)") survive intact.
set -euo pipefail

INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command')
CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty')

TMPDIR="$HOME/.cache/claude-code/envdev-hook"
mkdir -p "$TMPDIR"
TMPFILE=$(mktemp "$TMPDIR/cmd-XXXXXX.sh")
chmod 600 "$TMPFILE"

{
  echo "trap 'rm -f \"$TMPFILE\"' EXIT"
  if [ -n "$CWD" ]; then
    printf 'cd %q\n' "$CWD"
  fi
  printf '%s\n' "$CMD"
} > "$TMPFILE"

WRAPPED="flatpak-spawn --host distrobox enter envdev -- bash -l \"$TMPFILE\""

jq -n --arg cmd "$WRAPPED" \
  '{"hookSpecificOutput": {"hookEventName": "PreToolUse", "updatedInput": {"command": $cmd}}}'
