# CLI Commands Reference

## GitHub (`gh`)

### Fetch PR review comments

Native `gh` has limited inline comment support. Use `gh api` for full access.

```bash
# List all review comments (inline/line comments)
gh api repos/{owner}/{repo}/pulls/{number}/comments --paginate

# List review threads via GraphQL (includes resolution status)
gh api graphql -f query='
  query($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            isOutdated
            path
            line
            comments(first: 50) {
              nodes {
                author { login }
                body
                createdAt
              }
            }
          }
        }
      }
    }
  }
' -f owner=OWNER -f repo=REPO -F number=NUMBER
```

### Resolve a review thread (GitHub)

Requires the thread's GraphQL node ID (`PRRT_...`):

```bash
gh api graphql -f query='
  mutation($threadId: ID!) {
    resolveReviewThread(input: { threadId: $threadId }) {
      thread { isResolved }
    }
  }
' -f threadId=PRRT_xxxxx
```

### Post a reply to a review comment

```bash
# Reply to a specific review comment by comment ID
gh api repos/{owner}/{repo}/pulls/{number}/comments/{comment_id}/replies \
  -f body="Your reply here"

# General PR comment (not inline)
gh pr comment {number} --body "Your comment"
```

### Get owner/repo from current directory

```bash
# Extract owner and repo from git remote
gh repo view --json owner,name --jq '.owner.login + "/" + .name'
```

---

## GitLab (`glab`)

### Fetch MR discussions

```bash
# View MR with unresolved comments only
glab mr view {iid} --comments --unresolved

# View resolved comments
glab mr view {iid} --comments --resolved

# Full discussion data via API
glab api projects/:id/merge_requests/{iid}/discussions
```

### Resolve a discussion (GitLab)

```bash
# Resolve by note ID
glab mr note {iid} --resolve {note_id}

# Unresolve
glab mr note {iid} --unresolve {note_id}
```

### Post a reply

```bash
# Add a note/comment to MR
glab mr note {iid} -m "Your reply here"

# Reply to a specific discussion via API
glab api projects/:id/merge_requests/{iid}/discussions/{discussion_id}/notes \
  -f body="Your reply here"
```

---

## Tips

- **GitHub GraphQL** is the most reliable way to get thread resolution status and node IDs for resolving.
- **GitLab `--unresolved`** flag on `glab mr view` filters discussions natively — no API call needed for listing.
- Always `--paginate` on GitHub REST endpoints to avoid missing comments on large PRs.
- Use `gh repo view --json owner,name` to dynamically get owner/repo instead of hardcoding.
