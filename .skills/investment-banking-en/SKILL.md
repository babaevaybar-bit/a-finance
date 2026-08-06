---
name: investment-banking-en
description: Investment banking workflow assistant. Trigger when users mention "investment banking", "M&A", "mergers", "acquisitions", "valuation", "DCF", "LBO", "leveraged buyout", "comps", "trading comps", "transaction", "due diligence", "pitch book", "deck", "financial model", "three-statement model", "sensitivity analysis", "capital markets", "debt issuance", "credit", "private credit", "CIM", "confidential information memorandum", "memo", "covenant", "restructuring", "distressed", "buyer list", "model audit", "tearsheet", or any investment banking workflow. Supports financial modeling, valuation analysis, M&A modeling, LBO, DCF, deal execution materials, pitch decks, credit underwriting, model audit, and more.
license: MIT
packageType: instruction-skill
instructionOnly: true
---

# Investment Banking Workflow Assistant

## Prerequisites

This Skill is a pure instruction type. It does not require external APIs, MCP servers, or CLI tools. The AI Agent produces investment banking analysis, financial models, and transaction documents by following the workflows below based on user-provided financial data.

> This Skill produces analytical work product, not financial or investment advice. All assumptions, data source limitations, and model sensitivities must be clearly stated.

## Core Capabilities

### I. Financial Modeling

#### 1. Three-Statement Model Builder

Build integrated income statement, balance sheet, and cash flow statement projection models.

**User triggers**: "Build a three-statement model", "Financial projection model"

**Workflow**:
1. Confirm historical and projection data ranges
2. Build in sequence: revenue drivers → cost structure → working capital → capex → financing structure
3. Ensure all inter-statement linkages are balanced
4. Output complete model structure with key assumption list

#### 2. DCF Model Builder

Build discounted cash flow valuation models.

**User triggers**: "Run a DCF valuation", "Build a DCF model"

**Workflow**:
1. Confirm free cash flow projections
2. Calculate weighted average cost of capital (WACC)
3. Determine terminal value method (perpetuity growth / exit multiple)
4. Output valuation range with sensitivity analysis

#### 3. LBO Model Builder

Build leveraged buyout models and analyze transaction returns.

**User triggers**: "Build an LBO model", "Leveraged buyout analysis"

**Workflow**:
1. Confirm transaction structure (purchase price, financing sources)
2. Build Sources & Uses table
3. Project debt repayment and equity value
4. Calculate IRR and return multiples
5. Output key return metrics and sensitivity analysis

#### 4. Merger Model Builder

Build merger models and analyze EPS impact.

**User triggers**: "Build a merger model", "M&A accretion/dilution analysis"

**Workflow**:
1. Confirm acquirer and target financial data
2. Structure the transaction (consideration, financing)
3. Calculate accretion / dilution
4. Output pro-forma financial projections and EPS impact

#### 5. Distressed Recovery Waterfall

Build cash recovery waterfall models for distressed or restructuring scenarios.

**User triggers**: "Build a recovery waterfall", "Distressed recovery analysis"

**Workflow**:
1. Confirm capital structure priority stack
2. Set recovery assumptions by tranche
3. Calculate recovery amounts layer by layer
4. Output waterfall structure and recovery analysis

#### 6. Scenario & Sensitivity Generator

Generate multi-variable scenario analysis and sensitivity tables.

**User triggers**: "Run sensitivity analysis", "Scenario testing"

**Workflow**:
1. Confirm key drivers (growth rate, margin, discount rate, etc.)
2. Set variable ranges and step sizes
3. Generate data tables (1-way / 2-way sensitivity)
4. Output tornado chart or sensitivity matrix

### II. Valuation & Analysis

#### 7. Trading Comps

Build comparable company valuation analysis.

**User triggers**: "Run trading comps", "Comparable company analysis"

**Workflow**:
1. Confirm comparable screening criteria (industry, size, geography)
2. Compile key valuation multiples (P/E, EV/EBITDA, EV/Revenue, P/B, etc.)
3. Calculate median and mean metrics
4. Output valuation range and summary

#### 8. Financials Normalizer

Adjust and normalize financial statement data.

**User triggers**: "Normalize the financials", "Adjust for non-recurring items"

**Workflow**:
1. Confirm items requiring adjustment (non-recurring items, accounting policy differences)
2. Adjust item by item to normalized basis
3. Output before/after comparison and normalized financials

#### 9. Buyer / Investor List

Generate lists of potential buyers or investors.

**User triggers**: "Build a buyer list", "Potential investor list"

**Workflow**:
1. Clarify transaction type and screening criteria
2. Organize by category (strategic buyers, financial sponsors, etc.)
3. Include basic profile and investment preferences for each

### III. Deal Execution Materials

#### 10. CIM Builder

Write confidential information memoranda.

**User triggers**: "Draft a CIM", "Confidential information memorandum"

**Workflow**:
1. Confirm company overview and transaction summary
2. Output in standard IB format: executive summary → company overview → industry analysis → financial analysis → projections → appendix

#### 11. CIM Teardown

Analyze received CIM documents.

**User triggers**: "Tear down this CIM", "CIM analysis"

**Workflow**:
1. Extract key financial metrics and transaction information
2. Analyze key assumptions and valuation logic
3. Output CIM summary with key findings

#### 12. Memo Builder

Write internal transaction memos.

**User triggers**: "Draft a transaction memo", "Write an investment memo"

**Workflow**:
1. Confirm transaction overview and background
2. Output in standard format: executive summary → transaction background → financial analysis → due diligence findings → risk factors → recommendation

#### 13. Deal Process Tracker

Track and manage deal process milestones.

**User triggers**: "Update deal progress", "Deal tracker"

**Workflow**:
1. Confirm deal overview and current stage
2. Update key milestones and action items
3. Output deal tracking table

### IV. Pitch Materials

#### 14. Pitch Deck Builder

Create client pitch presentations.

**User triggers**: "Build a pitch deck", "Pitch book"

**Workflow**:
1. Confirm client objectives and transaction needs
2. Output in standard format: cover → executive summary → market overview → transaction capabilities → case studies → team → appendix

#### 15. Company Tearsheet

Generate one-page company overview summaries.

**User triggers**: "Create a company tearsheet", "Company overview"

**Workflow**:
1. Confirm company basic information
2. Compile key financial metrics, valuation multiples, ownership structure
3. Output one-page tearsheet

#### 16. Deck Quality Control

Review pitch decks and presentation materials for quality.

**User triggers**: "QC this deck", "Deck quality check"

**Workflow**:
1. Confirm deck content scope
2. Review by dimension: data consistency, formatting, logical flow, information completeness
3. Output issue list with revision suggestions

### V. Credit & Compliance

#### 17. Private Credit Underwriting

Execute underwriting analysis for private credit transactions.

**User triggers**: "Run private credit underwriting", "Credit memo"

**Workflow**:
1. Confirm borrower overview and financing needs
2. Analyze credit metrics (leverage, coverage, liquidity, etc.)
3. Assess collateral and structural protections
4. Output credit memorandum with recommendation

#### 18. Covenant Package Analyzer

Analyze covenant packages in loan or bond documentation.

**User triggers**: "Analyze the covenant package", "Covenant analysis"

**Workflow**:
1. Confirm covenant terms
2. Analyze line by line: financial covenants, restrictive covenants, negative pledges
3. Assess covenant headroom and potential risks
4. Output covenant analysis summary

#### 19. Capital Markets Issuance

Support equity or debt capital markets issuance work.

**User triggers**: "Capital markets issuance plan", "Debt offering"

**Workflow**:
1. Confirm issuer overview and financing needs
2. Analyze market window and conditions
3. Design issuance structure and pricing strategy
4. Output issuance recommendation and timeline

### VI. Supporting Workflows

#### 20. Meeting Preparation

Prepare materials and briefs for client or internal meetings.

**User triggers**: "Prepare meeting materials", "Client meeting prep"

**Workflow**:
1. Confirm meeting type and agenda
2. Compile client background, deal progress, and discussion points
3. Output meeting brief

#### 21. Model Audit & Tie-Out

Audit financial models for consistency and accuracy.

**User triggers**: "Audit this model", "Model tie-out"

**Workflow**:
1. Confirm audit scope and focus areas
2. Check: formula consistency, inter-sheet linkages, assumption reasonableness, sensitivity completeness
3. Output audit findings and remediation suggestions

#### 22. User Context Management

Manage user preferences and commonly used parameters.

**User triggers**: "Remember my preferences", "Save model parameters"

**Workflow**:
1. Confirm user preferences to save
2. Record common assumptions, template preferences, formatting requirements
3. Auto-apply in subsequent work

## Execution Priority (Strict Constraints)

1. **User Data First**: All analysis must be based on user-provided financial data and transaction information. The Agent must not fabricate financial data.
2. **Assumption Transparency**: All analysis assumptions must be clearly listed in the output. Data without sources must be noted.
3. **Deliverable Output**: Final output must be a ready-to-use banking artifact (model, memo, deck, etc.), not a process explanation.
4. **Disclaimer**: Output must include a note: "This is analytical work product and does not constitute investment advice."
5. **Call Invisibility Constraint**: Workflow execution is internal only. Output only the final analytical material.

## Reference Templates

Detailed output templates for key workflows are available in `references/ib-templates.md`, including valuation analysis, LBO model summary, transaction memorandum, pitch deck outline, CIM structure, and credit analysis templates. Prefer these template structures when generating banking materials.

## Communication Rules

- Respond in English by default.
- Lead with the analytical conclusion. Present the core finding first, then supporting detail.
- Financial data and assumptions must be clearly presented.
- End every response with one useful next step when applicable.
- Minimize jargon explanation unless the user asks.
- Maintain IB-style output structure: executive summary → assumptions → evidence → analysis → risks → next steps.

## Common Pitfalls

1. This Skill does not connect to Bloomberg, Capital IQ, or any financial data terminal. All financial data depends on user-provided context.
2. Assumptions in financial models must be confirmed by the user. The Agent must not determine key assumptions independently.
3. Valuation results must be presented as a range with clear sensitivity to different assumptions.
4. Merger model accretion/dilution analysis requires accurate tax and accounting treatment assumptions.
5. LBO model financing structure and interest rate assumptions should reflect current market conditions.
6. Comparable company analysis multiples are affected by market volatility; the data cutoff date must be noted.
7. Credit analysis and covenant assessment do not constitute legal opinions.