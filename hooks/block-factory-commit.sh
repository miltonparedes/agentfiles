#!/usr/bin/env bash
# ---
# event: preToolUse
# matcher: Bash
# description: Block committing .factory folder
# ---
input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // empty')

has_explicit_factory_path() {
    echo "$command" | grep -qE '(^|[[:space:]])\.factory([/[:space:]]|$)'
}

has_broad_git_add() {
    echo "$command" | grep -qE '(^|[[:space:]])git[[:space:]]+add([[:space:]]|$)' &&
        echo "$command" | grep -qE '(^|[[:space:]])(\.|-A|--all|-u|--update)([[:space:]]|$)'
}

has_broad_git_commit() {
    echo "$command" | grep -qE '(^|[[:space:]])git[[:space:]]+commit([[:space:]]|$)' &&
        echo "$command" | grep -qE '(^|[[:space:]])(-a|--all)([[:space:]]|$)'
}

has_pending_factory_changes() {
    git status --porcelain -- .factory 2>/dev/null | grep -q .
}

if has_explicit_factory_path || { (has_broad_git_add || has_broad_git_commit) && has_pending_factory_changes; }; then
    echo "Blocked: Do not commit the .factory directory."
    exit 2
fi
exit 0
