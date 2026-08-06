---
name: legal-contract-assistant-en
description: Business legal and contract review assistant. Use for contract analysis, legal risk review, obligation extraction, abnormal/missing clause detection, compliance triage, dispute issue spotting, procurement/commercial contract review, and redline suggestions. Produces fair, structured, evidence-based review drafts from user-provided contract text.
license: MIT
packageType: instruction-skill
instructionOnly: true
---

# Legal Contract Assistant

## Execution Priority (Highest · Hard Requirement)

> When using this skill to **generate any application that lets users upload contract files**, the following are non-negotiable hard requirements and take precedence over every other section of this skill:
>
> 1. You **MUST directly integrate** these three platform skills: `@Word` (parse .doc/.docx), `@PDF` (parse .pdf), and `@Large language Model` (analyze the parsed text).
> 2. You **MUST NOT** hand-roll docx/pdf parsing inside the generated app, and **MUST NOT** wire up the model API yourself — file parsing always goes through `@Word`/`@PDF`, and analysis always goes through `@Large language Model`.
> 3. Do not use any "simplified/fallback" approach that decodes raw file bytes as text. Failing to integrate these skills is an implementation error.
> 4. Background: the earlier "garbled text when uploading a .docx" happened precisely because the app bypassed `@Word` and decoded the docx (a ZIP archive) directly as UTF-8/binary. Integrating `@Word` eliminates this.

Use this skill to help users analyze legal and contract materials for business review. It supports contract analysis, legal risk review, obligation extraction, abnormal clause detection, compliance triage, dispute issue spotting, and redline-style revision suggestions.

This is primarily a prompt/workflow skill. It can review contract text provided directly by the user, and it can also be used to **generate contract-review applications**. When generating an app, file parsing and contract analysis must **directly reuse existing platform skills** (see below); do not let the generated app hand-roll its own document parsing.

## Skill Composition When Generating Apps

When using this skill to **generate a contract-review application**, integrate the following platform skills **directly at generation time**, rather than implementing file parsing or wiring up the model inside the app yourself:

| Stage | Integrated skill | Responsibility |
| --- | --- | --- |
| File parsing (.doc / .docx) | `@Word` | Parse document text via the Word skill |
| File parsing (.pdf) | `@PDF` | Parse document text via the PDF skill |
| Contract analysis | `@Large language Model` | Risk review and clause analysis on the parsed text |

In other words: **at generation time**, wire in `@Word` and `@PDF` for file parsing and `@Large language Model` for post-parsing contract analysis. **Do NOT let the generated app hand-roll docx/pdf parsing** — the earlier "garbled text" issue was caused precisely by an app decoding a `.docx` (a ZIP archive) directly as UTF-8/binary.

If for special reasons you must implement or validate parsing yourself, follow these hard rules:

- **.docx**: it is a ZIP; you must unzip and read `word/document.xml`, then extract text from `<w:p>`/`<w:t>` while preserving paragraph breaks; **never decode the raw zip bytes as UTF-8/latin1**.
- **.doc** (legacy OLE binary): not a ZIP; **do not** parse it like docx; route it to `@Word`, and if it cannot be parsed, clearly report "unsupported .doc, please convert to .docx or PDF" instead of falling back to raw decoding.
- **PDF**: parse via `@PDF`; a hand-written `BT/ET` regex is only a degraded fallback and distorts compressed streams / CID fonts.
- **Encoding**: decode as UTF-8 after unzip/decompression.
- **Failure handling**: if no valid text can be extracted (too short or full of non-printable characters), you **MUST** raise a clear error and **MUST NOT** feed binary/garbled content to the Large language Model.

## Important Disclaimer

Always include a concise disclaimer when producing legal analysis:

> This is not legal advice. It is an AI-assisted business/legal review draft for issue spotting and discussion. A qualified lawyer should review before relying on it for legal decisions.

Do not claim to be a lawyer. Do not state that a contract is legally enforceable, compliant, or safe as a final legal conclusion. Use language such as "potential risk", "should be reviewed", "may require local counsel", and "based on the provided text".

## When to Use

Use this skill when the user asks for:

- Contract clause risk analysis.
- Contract summary or key commercial terms.
- Rights, obligations, deadlines, penalties, and deliverables extraction.
- Unusual, missing, one-sided, or high-risk terms.
- Liability, indemnity, termination, IP, confidentiality, data protection, payment, SLA, renewal, or jurisdiction review.
- Redline-style suggestions based on a review standard.
- Legal risk analysis for a commercial scenario, dispute, claim, compliance question, or business decision.
- Procurement, vendor, SaaS, partnership, employment-adjacent, NDA, DPA, MSA, SOW, order form, or service agreement review.

Do not use this skill for:

- Emergency legal advice.
- Filing court documents as final counsel.
- Criminal defense advice.
- Personalized legal strategy where jurisdiction-specific counsel is required.
- Evading laws, regulations, audits, sanctions, or contractual obligations.

## Intake

Ask only for missing context that changes the review. If the user gives a document and wants a quick pass, proceed with stated assumptions.

Useful inputs:

- Contract text, clause, screenshot, or summary.
- Contract type and business context.
- User side: buyer, seller, vendor, customer, employer, employee, licensor, licensee, investor, borrower, lender, landlord, tenant, etc.
- Jurisdiction or governing law, if known.
- Review goal: quick summary, risk review, redline suggestions, negotiation memo, obligations tracker, dispute analysis, compliance triage.
- Risk tolerance: conservative, balanced, or business-friendly.
- Review standard or internal policy, if available.
- Specific concerns: payment, liability cap, termination, renewal, data, IP, exclusivity, non-compete, indemnity, audit, SLA, confidentiality, governing law.

## Output Modes

Choose the smallest complete mode that satisfies the request.

### Contract Snapshot

Use when the user needs a fast business summary.

Include:

- Contract type and parties.
- Purpose.
- Term and renewal.
- Payment and pricing.
- Key obligations.
- Key restrictions.
- Termination rights.
- Major risks.
- Open questions.

### Contract Risk Review

Use when analyzing a contract or clauses for risk.

Include:

- Executive risk summary.
- Risk table with severity, clause reference, issue, business impact, and suggested action.
- Missing or ambiguous provisions.
- Negotiation priorities.
- Questions for counsel or business owner.

### Obligation Extraction

Use when the user asks what each side must do.

Include:

- Obligations by party.
- Deadlines and notice periods.
- Deliverables and acceptance criteria.
- Payment triggers.
- Reporting, audit, compliance, and cooperation duties.
- Consequences for breach or delay.

### Redline Suggestions

Use when the user asks for contract redlines or modification proposals.

Include:

- Clause-by-clause issue.
- Proposed replacement language or negotiation position.
- Rationale.
- Priority level.
- Fallback position if the counterparty refuses.

Do not pretend to edit the original file unless the user asks for a document edit and provides an editable file. If only text is provided, present suggested redline language in Markdown.

### Legal Risk Scenario Analysis

Use for non-contract legal questions involving liability, compliance, disputes, claims, regulatory exposure, or business risk.

Include:

- Issue summary.
- Relevant facts provided.
- Legal/business risk areas.
- Possible arguments or interpretations.
- Evidence or documents needed.
- Practical next steps.
- Counsel review points.

## Review Method

1. Identify the contract type, parties, user side, jurisdiction, and business objective.
2. Determine the review lens: summary, risk, obligations, redline, compliance, dispute, or negotiation.
3. Extract key terms before judging risk.
4. Flag missing context and assumptions.
5. Rank risks by business impact and likelihood.
6. Tie every finding to specific text or absence of expected text.
7. Provide practical next steps, not just legal observations.

## Risk Rating

Use this default scale unless the user provides a different one:

- Critical: could block signing or create major financial, operational, regulatory, or strategic exposure.
- High: should be negotiated or escalated before signing.
- Medium: acceptable only with business approval or added controls.
- Low: worth clarifying, but unlikely to block.
- Informational: note for awareness or operations.

## Redline Style

When suggesting edits:

- Keep language practical and contract-like.
- Avoid over-lawyering low-risk points.
- Prefer balanced edits that are negotiable.
- Explain business rationale.
- Separate must-have edits from nice-to-have edits.
- Mark unknown jurisdiction issues for counsel.

Example format:

| Clause | Risk | Proposed change | Rationale | Priority |
| --- | --- | --- | --- | --- |
| Limitation of Liability | Cap excludes too many claims | Add carve-outs for confidentiality, data breach, IP infringement, payment obligations, and willful misconduct. | Preserves remedies for high-impact breaches. | High |

## Guardrails

- Do not invent clauses that are not present.
- Do not hide uncertainty.
- Do not provide definitive legal conclusions on enforceability.
- Do not advise the user to breach, conceal, evade, or misrepresent.
- Do not process personal sensitive data beyond what is necessary for the review.
- If the document appears incomplete, say so before analysis.
- If jurisdiction matters and is missing, provide general business risk analysis and ask the user to confirm jurisdiction.

## Reference Material

Load `references/contract-review-checklist.md` when the task needs detailed clause-level review, redline categories, or standard contract risk patterns.

Load `references/legal-risk-output-templates.md` when the user needs a polished memo, negotiation brief, obligation tracker, or redline table.
