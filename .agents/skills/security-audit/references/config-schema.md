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
| **Likely-N/A guidance** | Checklist sections that are probably N/A for this app (still list every ID in the report). |

## Example (a loopback reverse proxy)

```markdown
| Setting | Value |
|---------|-------|
| **Checklist** | `.github/skills/security-audit/references/checklist-cs-web-secdev-v5.1.md` |
| **Report language** | Nederlands |
| **Report output path** | `docs/security-audit-cs-web-secure-development-v<appVersion>.md` |
| **Application type** | Lokale, loopback-only reverse proxy (Windows service/desktop). |
| **Primary trust boundary** | Loopback + Negotiate + fail-closed groep-SID-autorisatie. |
| **CVSS architectural defaults** | AV:L (loopback); bevoegde lokale caller PR:L; geprivilegieerde lokale partij PR:H. |
```
