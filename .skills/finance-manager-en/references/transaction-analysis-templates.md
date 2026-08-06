# Transaction Analysis Templates

Use these templates when the user provides transactions, account summaries, or budget data.

## Table of Contents

- Data normalization
- Category taxonomy
- Metrics table
- Spending analysis output
- Monthly finance report
- Budget plan output
- Debt payoff output
- Anomaly detection
- Data-quality checks

## Data Normalization

Expected transaction fields:

| Field | Meaning |
| --- | --- |
| Date | Transaction date. |
| Description | Merchant, counterparty, or memo. |
| Amount | Positive or negative amount. Confirm sign convention. |
| Category | User-provided or inferred category. |
| Account | Optional source account. |
| Type | Income, expense, transfer, refund, debt payment, fee, savings. |

Normalize into:

- Income.
- Essential expenses.
- Discretionary expenses.
- Savings and investments.
- Debt payments.
- Transfers.
- Refunds/reimbursements.
- Unknown.

## Category Taxonomy

Default categories:

- Income.
- Housing.
- Utilities.
- Groceries.
- Restaurants and delivery.
- Transportation.
- Insurance.
- Health and medical.
- Debt payments.
- Childcare or family support.
- Education.
- Subscriptions.
- Shopping.
- Entertainment.
- Travel.
- Gifts and donations.
- Savings.
- Investments.
- Fees and interest.
- Taxes.
- Transfers.
- Unknown.

If the user already has categories, preserve them and only consolidate when useful.

## Metrics Table

| Metric | Formula / Source | Value | Notes |
| --- | --- | --- | --- |
| Total income | Sum income |  |  |
| Total expenses | Sum expenses, excluding transfers |  |  |
| Net cash flow | Income - expenses |  |  |
| Savings rate | Net cash flow / income |  |  |
| Essential expenses | Needs categories |  |  |
| Discretionary expenses | Wants categories |  |  |
| Debt payments | Minimums plus extra payments |  |  |
| Largest category | Max category spend |  |  |

## Spending Analysis Output

### Boundary

This is educational personal finance guidance, not financial, investment, tax, legal, or debt-counseling advice. Verify numbers and consult a qualified professional for decisions with legal, tax, investment, credit, or insolvency consequences.

### Summary

- Period:
- Currency:
- Total income:
- Total expenses:
- Net cash flow:
- Savings rate:
- Main finding:

### Category Breakdown

| Category | Amount | Share of expenses | Comment |
| --- | --- | --- | --- |

### Top Transactions

| Date | Description | Category | Amount | Note |
| --- | --- | --- | --- | --- |

### Recurring Costs

| Merchant / category | Estimated frequency | Monthly amount | Keep / reduce / cancel |
| --- | --- | --- | --- |

### Recommendations

| Priority | Action | Estimated monthly impact | Difficulty | Why |
| --- | --- | --- | --- | --- |

### Assumptions and Data Gaps

- 

## Monthly Finance Report

### Executive Summary

Give a concise answer-first assessment.

### Key Metrics

Use the metrics table.

### What Improved

- 

### What Got Worse

- 

### Watch List

- 

### Next Month Plan

1. 
2. 
3. 

## Budget Plan Output

| Category | Current | Recommended target | Change | Notes |
| --- | --- | --- | --- | --- |

### Budget Rules

- Fixed expenses:
- Flexible expenses:
- Savings:
- Debt:
- Weekly check-in:

### Tradeoffs

Explain what the user would give up and what they gain.

## Debt Payoff Output

| Debt | Balance | APR | Minimum payment | Recommended extra payment | Priority |
| --- | --- | --- | --- | --- | --- |

### Avalanche Plan

Highest APR first.

### Snowball Plan

Smallest balance first.

### Recommendation

Explain which method fits the user's stated behavior and goals.

## Anomaly Detection

Look for:

- Duplicate-looking transactions.
- Sudden category spikes.
- Unusually large purchases.
- New subscriptions.
- Fees, interest, overdrafts, and penalties.
- Refunds categorized as income.
- Transfers categorized as spending.
- Credit-card payments double-counted with card transactions.

Report anomalies as possibilities, not accusations.

## Data-Quality Checks

Before final recommendations, check:

- Does income appear complete?
- Are transfers excluded?
- Are refunds treated correctly?
- Are credit-card payments double-counted?
- Does the date range match the user's request?
- Are categories consistent?
- Are one-time expenses separated from recurring expenses?
