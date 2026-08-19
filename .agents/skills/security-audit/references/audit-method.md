# Audit method (generic)

The `security-audit` skill follows this method. It is **repo-independent**: all repository-specific values
come from the repository configuration (`.github/security-audit.config.md`, described in `config-schema.md`).
Produce a **reproducible** report: re-running on the same commit must yield ~the same verdicts, scores and
structure. Follow every rule literally; do not improvise.

## 0. Determinism

- Intended execution: **pinned model + `temperature = 0`** (set by a CI runner; in an interactive run,
  record that it was not pinned).
- Do not invent facts. **Read the actual source files** before judging a control. **Never fabricate line
  numbers** — open the file and cite the real line(s).
- Base every verdict only on the code/config in scope; do not assume behavior you did not verify.

## 1. Inputs

- **Checklist:** the file named under *Checklist* in the configuration — the authoritative list of controls
  (1.1 … 13.9). Do **not** modify it.
- **Codebase:** the *In scope* source from the configuration.
- **Acceptance register:** `.github/security-audit.accepted-risks.md` (if present) — durable records of
  accepted risks that must be reflected, not re-litigated.

## 2. Method

1. Read all in-scope files completely.
2. For **every** control in the checklist, assign exactly one result and cite evidence.
3. Cluster N/A controls that share a rationale (e.g. all of section 9) but still list every ID.

## 3. Verdict rules

| Result | Meaning | Requirement |
|--------|---------|-------------|
| ✅ | Control is met | One concise justification + a code cross-reference |
| ⚠️ | Requires attention | A full finding: description, risk, recommendation, **CVSS** |
| ➖ | Not applicable | A one-line rationale why it cannot apply to this app |

Bias rules: judge authorization **fail-closed** (an empty allow-list denying everyone is ✅, not ⚠️). A
deliberate, documented design trade-off is ⚠️ with the accepted-risk noted — never ✅ and never omitted.

**Accepted risks:** for any ⚠️ finding whose control ID(s) match an **active** entry in the acceptance
register, keep the ⚠️ result but label it **Accepted risk** in the report with the register reference
(accepted-by, date, PR). If the acceptance is past its `Review by` date, or the finding's CVSS is now
higher than when accepted, label it **needs re-review** instead. Never silently downgrade an accepted
risk to ✅.

## 4. Evidence rules

- Reference code as Markdown links with **real** line numbers, relative to the report's location, e.g.
  `[ProcessRunner.cs#L23](../src/AfasIntegrationProxy/Secrets/ProcessRunner.cs#L23)`.
- Never wrap file references in backticks or leave them as bare text.

## 5. CVSS convention (for every ⚠️ finding)

- Use **CVSS 3.1 Base** scores only (no temporal/environmental).
- Apply the **CVSS architectural defaults** from the configuration to reflect the app's exposure, then
  adjust per finding as the evidence warrants.
- Render as: `**CVSS 3.1:** [<score> <Severity>](<calculator-url>) — ` followed by the vector in backticks.
- Calculator URL format: `https://www.first.org/cvss/calculator/3.1#CVSS:3.1/AV:.../...` (vector in the fragment).
- A finding may carry a **conditional sub-case** with its own score; label it and do not double-count it.
- Severity bands: None `0.0` · Low `0.1–3.9` · Medium `4.0–6.9` · High `7.0–8.9` · Critical `9.0–10.0`.
- Process/hygiene items with no technical vector: mark CVSS **n.v.t. (informational)**.

## 6. Output

Write a **new** file at the *Report output path* from the configuration (never overwrite the checklist),
in the *Report language* from the configuration. Use exactly this structure and order:

1. **Title + provenance table** — auditor (model), date, target version, commit SHA, checklist version,
   the skill version, and the determinism note (pinned+temp0 or "interactive, not pinned").
2. **Scope & context** — in/out of scope (from the configuration) + a one-paragraph description of the app.
3. **Risk-analyse** — a short asset/threat/mitigation table + the primary trust boundary.
4. **Samenvatting resultaten** — counts of ✅ / ⚠️ / ➖.
5. **Kwetsbaarheden per hoofdstuk (CVSS 3.1 severity)** — a table `Critical | High | Medium | Low | Info | Totaal`
   per chapter 1–13 + a totals row, with the band legend and a note on conditional/overarching items.
6. **Checklist-resultaten** — per section (1.0 … 13.0) a table `ID | Control | Result | Ref`.
7. **Bevindingen & motivatie**:
   - **⚠️ Aandachtspunten** — per finding: heading, **CVSS** line, Bevinding, Risico, Aanbeveling.
   - **✅ Belangrijkste sterke punten** — short bullets with refs.
   - **➖ N/A** — motivation per cluster.
8. **Vervolg** — approval + prioritized fixes.

(Use the *Report language* headings; the Dutch names above are the reference structure.) Granularity:
**detailed** for ⚠️; **short** for ✅ and ➖.

## 7. Provenance stamp

Record in the report header: model + version, temperature, **skill version**, checklist version, and the
audited commit SHA. This is what makes a re-run auditable.

---
**Method version:** 1.0 · **Checklist:** Certified Secure Web App Secure Development v5.1
