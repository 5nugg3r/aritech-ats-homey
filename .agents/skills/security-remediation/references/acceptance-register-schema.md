# Acceptance register — schema

File: `.github/security-audit.accepted-risks.md` in the target repo. Repo-owned and durable; edited **only**
via accept-PRs (a human merges = the sign-off). The `security-audit` skill reads this file and marks
matching findings as **Accepted risk** (or **needs re-review** when expired/escalated).

One section per accepted risk:

```markdown
## <finding-id(s)> — <short title>
- **Status:** Accepted | Accepted-with-compensating-controls
- **CVSS:** <score> (`<vector>`)
- **Accepted by:** <name / role>
- **Date:** <YYYY-MM-DD>
- **Review by:** <YYYY-MM-DD>
- **Scope/conditions:** <where/when this acceptance holds>
- **Rationale:** <why the risk is acceptable>
- **Reference:** PR #<n> · report <version> (commit <sha>)
```

**Required fields:** Status, Accepted by, Date, Review by, Rationale. Omit any → the accept-PR must not be
created.
