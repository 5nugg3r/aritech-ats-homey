# PR body templates

## Fix PR

```markdown
## Security fix — <finding-id>: <title>

**Finding:** <id> (audit report <version>, commit <sha>)
**CVSS:** <score> (`<vector>`)

### Cause
<what the code did / why it was flagged>

### Change
<what this PR changes>

### Test
<the added/updated test and what it proves>
```

## Accept-risk PR

```markdown
## Accept risk — <finding-id>: <title>

Records an accepted risk in `.github/security-audit.accepted-risks.md`.

**CVSS:** <score> (`<vector>`)
**Accepted by:** <name> · **Review by:** <date>
**Scope/conditions:** <...>

### Rationale
<why the risk is acceptable>

> Merging this PR is the accountable sign-off. Do not self-merge.
```
