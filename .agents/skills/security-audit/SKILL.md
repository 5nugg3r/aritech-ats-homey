---
name: security-audit
description: 'Use when the user asks to run a security audit, secure-development audit, or Certified Secure checklist audit on this repository, or to (re)generate the security audit report. Performs a reproducible white-box source-code audit against the Certified Secure Web Application Secure Development Checklist and writes a report with CVSS-scored findings. DO NOT use for runtime error debugging, deployment troubleshooting, or general coding questions.'
---

# Security Audit (Certified Secure — Secure Development)

A reproducible **white-box source-code audit** against the **Certified Secure Web Application Secure
Development Checklist v5.1**. The checklist and method are **bundled in this skill** and are
repo-independent; only the per-repository configuration and the generated reports live in the target repo.

## When to use
- "Audit this repo against Certified Secure", "run the security audit", "(re)generate the audit report".

## When NOT to use
- Runtime error diagnosis, general coding questions, or deployment troubleshooting.

## Bundled files
| File | Purpose |
|------|---------|
| `references/checklist-cs-web-secdev-v5.1.md` | The authoritative controls (1.1 … 13.9), as a machine-readable working copy. **Never edit.** |
| `references/cs-web-application-secure-development.pdf` | The original Certified Secure checklist PDF — the authoritative **source** (attribution). |
| `references/audit-method.md` | The generic audit method (verdict rules, evidence, CVSS, report structure). |
| `references/config-schema.md` | The shape of the per-repository configuration. |
| `references/configurator.md` | How to analyze a repo and generate its configuration. |

## Source & attribution
The checklist is the **Certified Secure Web Application Secure Development Checklist v5.1**
(<https://www.certifiedsecure.com/checklists>), licensed **CC BY-ND 4.0**. The bundled PDF
(`references/cs-web-application-secure-development.pdf`) is the authoritative source; the `.md` is a
format-converted working copy for auditing. Do not redistribute the modified `.md` publicly as a
derivative under the No-Derivatives terms.

## Per-repository configuration
The repo-specific settings (scope, application type, CVSS context, language, output path, and whether the
report is committed) live in **`.github/security-audit.config.md`** in the target repo — never in this skill.

## Workflow
1. **Ensure configuration exists.** Look for `.github/security-audit.config.md`.
   - **Missing** → follow `references/configurator.md` to analyze the repo and generate it. Present it to
     the user and ask them to **review and commit** it before proceeding. Never audit against an
     unreviewed configuration.
   - **Present** → read it.
2. **Load** the checklist (`references/checklist-cs-web-secdev-v5.1.md`) and the method
   (`references/audit-method.md`).
3. **Read the acceptance register** (`.github/security-audit.accepted-risks.md`, if present). A finding
   with an **active** acceptance is reported as **Accepted risk** (with who/date/PR), never silently ✅;
   an **expired** or CVSS-escalated acceptance is reported as **needs re-review**.
4. **Run the audit** per the method, using the configuration and the register, and write the report to the
   *Report output path*. Never overwrite the checklist.
5. **Honour *Report in version control*.** When it is `no`, write the report but leave it untracked, verify
   the path is ignored, and say so. Never commit or stage a report the configuration excludes.

## Reproducibility
Generate the configuration **once** and commit it (re-running the configurator each audit adds variance).
For a deterministic run, pin the model and set `temperature = 0`; record model, skill version, checklist
version and the audited commit SHA in the report header.

---
**Skill version:** 1.2.0 · **Checklist:** Certified Secure Web App Secure Development v5.1
