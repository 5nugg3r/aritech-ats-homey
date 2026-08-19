# Per-repository configuration — schema

The `security-audit` skill reads **`.github/security-audit.config.md`** from the target repository. Generate
it with `configurator.md`, then **review and commit** it. It is the reproducibility anchor: generate once,
change only on a significant architecture/scope change.

## Fields

| Field | Meaning |
|-------|---------|
| **Checklist** | Repo-relative path to the checklist the audit runs against (normally the copy bundled in this skill). |
| **Report language** | Language for the generated report (e.g. `Nederlands`, `English`). |
| **Report output path** | Where the report is written; use the `<appVersion>` placeholder, e.g. `docs/security-audit-cs-web-secure-development-v<appVersion>.md`. |
| **Application type** | Short description of what the app is and how it is exposed. Drives the CVSS defaults. |
| **Primary trust boundary** | The main security boundary the design relies on. |
| **CVSS architectural defaults** | Baseline CVSS vector context derived from exposure (e.g. `AV:L` for loopback, `AV:N` for network-facing; the default privileges for the expected attacker). |
| **In scope** | Source paths/globs the audit must read and judge. |
| **Out of scope** | Paths explicitly excluded (tests fixtures, deployment scripts, generated/third-party code, docs). |
| **Report in version control** | `yes` or `no` — whether the generated report is committed. A finished report describes, with line references, how the security of a running system can be defeated. In a private repository that history is valuable; in a public one it is a manual for attacking the very system it audits. |
| **Likely-N/A guidance** | Checklist sections that are probably N/A for this app (still list every ID in the report). |

## Report in version control

There is no safe default, so the configurator **asks** rather than assumes, and records the answer here.

- **`yes`** — the report is committed alongside the code. Findings, verdicts and their evolution stay auditable, and a reviewer can diff two runs. Choose this only when the repository is private and will stay private.
- **`no`** — the report is written to the output path but kept out of version control. The configurator adds the report path pattern to `.gitignore`, and the audit says so after writing. The configuration itself is still committed, so the audit stays reproducible: anyone can re-run it and obtain the same report without it living in the repository.

When the repository is public, may become public, or is referenced as the public source of a released product, the answer is **`no`**.

## Example (a loopback reverse proxy)

```markdown
| Setting | Value |
|---------|-------|
| **Checklist** | `.github/skills/security-audit/references/checklist-cs-web-secdev-v5.1.md` |
| **Report language** | Nederlands |
| **Report output path** | `docs/security-audit-cs-web-secure-development-v<appVersion>.md` |
| **Report in version control** | no |
| **Application type** | Lokale, loopback-only reverse proxy (Windows service/desktop). |
| **Primary trust boundary** | Loopback + Negotiate + fail-closed groep-SID-autorisatie. |
| **CVSS architectural defaults** | AV:L (loopback); bevoegde lokale caller PR:L; geprivilegieerde lokale partij PR:H. |
```
