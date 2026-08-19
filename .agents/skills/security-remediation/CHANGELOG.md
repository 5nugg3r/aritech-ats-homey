# Changelog — `security-remediation` skill

## 1.0.1 — 2026-08-13
- Make the branch+PR mandate explicit and imperative ("Hard rules" + a required git flow): every
  file-changing disposition goes on its own branch and PR; never commit to the default branch; never merge.

## 1.0.0 — 2026-08-13
- Initial release. Per-finding disposition (Fix / Accept / Defer) with fix-PRs, a durable accepted-risk
  register, and defer-issues. Human-merge sign-off; the agent never self-merges.
