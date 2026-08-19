# Changelog — `security-audit` skill

## 1.2.0 — 2026-08-19
- New configuration field **Report in version control**. The configurator now asks whether the generated
  report is committed instead of leaving it implicit, and adds the report path to `.gitignore` when the
  answer is `no`.
- Rationale: a finished report names, with line references, how the security of a running system can be
  defeated. In a private repository that history is valuable; in a public one it is an attack manual.
  There is no safe default, so the choice is made per repository and recorded.
- The audit workflow honours the field and never stages a report the configuration excludes.

## 1.1.0 — 2026-08-13
- Read the acceptance register (`.github/security-audit.accepted-risks.md`) and reflect active accepted
  risks (or "needs re-review" when expired/escalated) in the report.

## 1.0.0 — 2026-08-13
- Initial release.
- Reproducible white-box audit against the **Certified Secure Web Application Secure Development
  Checklist v5.1**.
- Bundled: checklist working copy (`.md`) + original source (`.pdf`), generic audit method, config
  schema, and configurator.
- CVSS 3.1 base scoring convention with calculator links; per-chapter severity summary; provenance stamp.
