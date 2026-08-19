# Remediation method

For each ⚠️ finding in the audit report, apply exactly one disposition.

## Decision policy

| Severity | Allowed dispositions |
|----------|----------------------|
| Critical / High / Medium | **Fix** or **Accept** (never silently Defer) |
| Low / Info | Fix, Accept, or Defer |

- An **active** acceptance (present in the register, not past its `Review by`) → no action; note it.
- An **expired** acceptance, or a finding whose CVSS is now higher than at acceptance → treat as open and
  re-decide.

## Fix
- Branch: `fix/security-<id>-<slug>`.
- Implement the **smallest correct change**; add or extend a test that proves it.
- Do **not** edit the audit report (the next audit regenerates it).
- Open a PR using the fix template. Reference the finding ID and CVSS.

## Accept
- **Requires** rationale, accepted-by, and a `Review by` date (default: +1 year). Refuse to proceed if any
  is missing.
- Branch: `risk/accept-<id>`.
- Add/append an entry to `.github/security-audit.accepted-risks.md` per the schema.
- Open a PR using the accept template. **Do not** self-merge — the responsible person merges = sign-off.

## Defer
- Open a GitHub issue titled `[security] <id> — <title>`, with a severity label and a link to the finding.

## Rules
- One PR per finding by default; batch only on explicit request.
- Never combine a fix and an acceptance in one PR.
- A finding spanning multiple control IDs (e.g. 4.6/4.7/4.8) → one entry/PR keyed on the group.
- Address conditional sub-cases explicitly (e.g. an `http://` downgrade sub-case).

## Git flow (MUST — for every Fix and Accept)

Work from the default branch; per finding create a branch, commit **only** that finding's change, push,
and open a PR. **Never** edit or commit the change on the default branch, and **never** merge the PR.

```
git checkout -b <branch>          # fix/security-<id>-<slug>   |   risk/accept-<id>
# make ONLY this finding's change (code + test for Fix; register entry for Accept)
git add <changed paths>
git commit -m "<message>"
git push -u origin <branch>
gh pr create --base <default-branch> --title "<title>" --body "<from pr-templates.md>"
git checkout <default-branch>
```
