# Configurator — generate the repository configuration

Goal: analyze the target repository and produce `.github/security-audit.config.md` following
`config-schema.md`. The output is a **proposal**; a human reviews and commits it. Generate it **once**
(not on every audit) — it is the reproducibility anchor.

## Steps

1. **Detect stack & entry points.** Read manifests (`*.csproj`, `package.json`, `go.mod`, `pyproject.toml`,
   `pom.xml`, etc.), the main/startup files, and how the app is exposed (network listener, loopback, CLI,
   library, desktop UI).
2. **Classify the application type** and the **primary trust boundary** in one sentence each.
3. **Derive the CVSS architectural defaults** from exposure:
   - **Network-facing** (public/LAN listener) → `AV:N`; set attacker privileges/UI per the auth model.
   - **Loopback-only / desktop / local IPC** → `AV:L`; authorized local caller `PR:L`; a privileged local
     attacker (e.g. sniffing another process) `PR:H`.
   - **CLI / library** → `AV:L`, and expect many web-only sections to be N/A.
4. **Propose In scope** — the application source that ships or handles requests. **Propose Out of scope** —
   tests/fixtures, deployment/install scripts, generated code, vendored third-party, and docs, unless the
   user says otherwise.
5. **Propose Likely-N/A sections** from absent features: no cookies/sessions → 9; no uploads → 10; no XML →
   12; no SQL/HTML/JS/LDAP → the matching parts of 8.
6. **Set Report language** (match the repo/user; default English unless the repo or user is clearly in
   another language) and the **Report output path**.
7. **Ask whether the report goes into version control** — do not decide this alone. Use `AskUserQuestion`
   with the two options below and record the answer as *Report in version control*. Say which way you
   lean and why: a finished report names, with line references, how the security of a running system can
   be defeated, so a public repository turns it into an attack manual. State the repository's current
   visibility if you can determine it.
   - **Keep it out of git (`no`)** — recommended when the repository is public, may become public, or is
     referenced as the public source of a released product. Also add the report path pattern to
     `.gitignore` so a later run cannot land in a commit by accident.
   - **Commit it (`yes`)** — defensible for a repository that is private and stays private, where the
     history of findings across runs is worth having.
8. **Write** `.github/security-audit.config.md`, print a short summary of the choices, and ask the user to
   **review and commit** it.

## Notes

- **Under-scope N/A.** When unsure whether a control applies, do **not** mark it N/A in the config — leave
  it for the audit to judge per control.
- **Never answer the version-control question yourself.** It weighs disclosure risk against auditability,
  and only the repository owner knows where the code will end up.
- Keep the config **small and stable**; churn here undermines reproducibility.

---
**Configurator version:** 1.1
