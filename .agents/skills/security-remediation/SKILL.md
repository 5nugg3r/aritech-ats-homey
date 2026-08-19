---
name: security-remediation
description: 'Use when the user wants to act on the findings of a security audit report — propose fixes as pull requests, record accepted risks, or defer findings as issues. Reads the audit report and the acceptance register and processes each finding consistently. DO NOT use to perform the audit itself (use the security-audit skill) or for general coding.'
---

# Security Remediation

Consistently turns the findings of a **security-audit** report into action: **Fix** (a PR), **Accept**
(a durable risk record + PR), or **Defer** (an issue). The agent proposes; a human reviews and merges —
the merge is the accountable sign-off.

## When to use
- "Fix the audit findings", "accept this risk", "remediate the security report".

## When NOT to use
- Running the audit itself (that is the `security-audit` skill), or general coding.

## Inputs
- The latest audit report (the `security-audit` config's *Report output path*).
- The acceptance register `.github/security-audit.accepted-risks.md` (schema in
  `references/acceptance-register-schema.md`; created if missing).
- The in-scope source code.

## Bundled files
| File | Purpose |
|------|---------|
| `references/remediation-method.md` | Per-finding decision flow and PR/issue policy. |
| `references/acceptance-register-schema.md` | The acceptance register format. |
| `references/pr-templates.md` | Body templates for fix-PRs and accept-PRs. |

## Hard rules (MUST)
- **Never commit to the default branch** (`main`/`master`). Every file-changing disposition (Fix, Accept)
  goes on its **own branch** and is proposed as a **pull request** — never a direct edit on the default branch.
- **The agent does the git work:** create the branch, commit the change there, push, and open the PR.
- **Never merge.** The responsible human reviews and merges; the merge is the accountable sign-off.
- One PR per finding by default; never mix a fix and an acceptance in one PR.

## Workflow
1. Read the report and the acceptance register.
2. For each ⚠️ finding: if it already has an **active** acceptance, skip (note it). Otherwise ask the user
   for a decision — **Fix**, **Accept**, or **Defer** — following `references/remediation-method.md`.
3. Execute per decision (one PR per finding by default; never mix a fix and an acceptance):
   - **Fix** → branch `fix/security-<id>-<slug>`, implement the smallest correct change + a test, open a
     PR using `references/pr-templates.md`.
   - **Accept** → branch `risk/accept-<id>`, add an entry to the acceptance register, open a PR.
   - **Defer** → open a GitHub issue with a severity label linking the finding.
4. **Never self-merge.** The responsible human reviews and merges (the sign-off).

## Reproducibility & accountability
Accepted risks live in the **register** (durable), not only in the regenerated report. The `security-audit`
skill reads the register and reflects each active acceptance. Every action is a reviewable PR/issue with
author, reviewer and rationale in git history.

---
**Skill version:** 1.0.1
