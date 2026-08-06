# Bill File Parsing Rules (Format-Agnostic)

These are **hard requirements**. Core principle: **never hardcode the format of any single payment provider or bank**. Implement one generic pipeline — header discovery, column semantic mapping, and interactive fallback — so that exports from any wallet, any bank (debit or credit card), PayPal, Stripe, and unknown sources all parse.

Any specific column names mentioned below are **examples only** and must never be used as the sole matching criterion.

---

## 1. Core principles

1. **No provider-specific branches.** Do not write `if (isProviderX)` to decide column positions. Every source goes through the same pipeline.
2. **Identify by semantics, not by position.** Column meaning is inferred from the header text, never from a column index or a fixed row number.
3. **When auto-detection fails, fall back to user interaction** — never just report "invalid file format".
4. **Parse as much as possible.** Missing fields should trigger user-supplied mapping, not a total failure.

---

## 2. Standard pipeline (six steps, order matters)

```
1. Encoding detect/decode  →  2. Header row location  →  3. Column semantic mapping
                                                              ↓
6. Result validation  ←  5. Value cleaning  ←  4. Direction (income/expense) resolution
```

### Step 1: Encoding detection and decoding

- Support UTF-8 (with BOM), GBK / GB18030, UTF-16LE/BE, Big5.
- Locale statement CSVs are frequently **GBK/GB18030**; overseas exports are mostly UTF-8.
- **Decode correctly before any matching**, otherwise headers are garbled and mapping is guaranteed to fail.
- On decode failure, raise a clear error ("encoding could not be determined; please re-save as UTF-8 CSV").

### Step 2: Header row location (never rely on a fixed row index)

Exports commonly prepend explanatory lines (account info, date range, disclaimers) — anywhere from 0 to 20+ rows, varying by source.

Algorithm requirements:
- Scan the **first 30 rows** (for Excel, scan every worksheet).
- Compute a **header score** per row: how many cells match aliases in the field dictionary below.
- Pick the highest-scoring row that matches **at least one date concept and one amount concept**.
- **Never** hardcode a row index. **Never** use a blunt "skip lines starting with # or whitespace" rule — it will skip the real header.
- If no row qualifies → go to the fallback strategy in section 7.

### Step 3: Column semantic mapping (normalize + aliases + fuzzy match)

Normalization function (one single function shared by **both** the Excel and CSV paths):

1. Strip parentheses and their contents (both full-width `（）` and half-width `()`).
2. Strip whitespace, tabs, invisible characters.
3. Convert full-width characters to half-width.
4. Lowercase.
5. **Preserve `/` and `-`** (direction columns such as `收/支`, `借/贷`, `Dr/Cr` depend on them).

Match order: exact alias hit → alias containment → edit-distance fuzzy match.

> Counter-example: exact-matching the literal `金额` misses `金额（元）`, `金额(元)`, and `交易金额`, so the amount index becomes -1, every row's amount is 0 and gets skipped — surfacing as "no transactions found".

### Step 4: Direction resolution

See section 4. All four modes must be supported.

### Step 5: Value cleaning

See section 5.

### Step 6: Result validation

- Zero valid rows → report whether the failure was "header not detected" or "all amounts empty".
- Spot-check: dates parse, amounts are valid numbers, direction resolved.
- Report counts: rows imported / rows skipped / skip-reason breakdown.

---

## 3. Field concepts and alias dictionary (must cover, keep extending)

| Concept | Required | Common aliases (examples, not exhaustive) |
| --- | --- | --- |
| Transaction date | Yes | 交易时间、交易创建时间、交易日期、记账日期、入账日期、日期、发生日期、Date, Transaction Date, Posted Date, Booking Date, Value Date |
| Amount | Yes | 金额、金额（元）、交易金额、发生额、变动金额、Amount, Transaction Amount, Value |
| Income amount | Yes for two-column format | 收入、收入金额、贷方发生额、存入、Credit, Credit Amount, Money In, Deposit |
| Expense amount | Yes for two-column format | 支出、支出金额、借方发生额、Debit, Debit Amount, Money Out, Withdrawal |
| Direction | Format-dependent | 收/支、收支、收支类型、资金动向、借贷标志、借/贷、Type, Direction, Dr/Cr, Debit/Credit, CR/DR |
| Counterparty / merchant | Recommended | 交易对方、商户名称、交易对手、对方账户、收款方、Payee, Merchant, Counterparty, Name |
| Description / memo | Recommended | 商品说明、摘要、备注、附言、用途、Description, Memo, Narrative, Details, Reference |
| Category | Optional | 交易分类、消费类别、Category, MCC |
| Balance | Optional | 余额、账户余额、Balance, Running Balance |
| Currency | Optional | 币种、货币、Currency, CCY |
| Status | Optional | 交易状态、状态、Status |
| Account / card number | Optional | 账号、卡号、账户、Account, Card Number (**must be masked to the last four digits**) |
| Transaction ID | Optional | 交易订单号、流水号、凭证号、Transaction ID, Reference No |

Requirements:
- The dictionary **must be extensible** and defined in one place, not scattered through business logic.
- Cover both Chinese and English aliases so overseas statements work.
- **Keep unmapped columns with their original header names in `jsonb`** — do not discard them; the user may map them later.

---

## 4. Four direction modes (all must be supported)

| Mode | Signature | Handling |
| --- | --- | --- |
| A. Direction column + single amount column | A dedicated direction column exists | Resolve from the direction value; take the absolute amount |
| B. Separate income / expense columns | Two amount columns, only one populated per row | Whichever column has a value defines the direction; common in bank statements |
| C. Signed amount | Single amount column, expenses negative | Resolve by sign; note that `(123.45)` also means negative |
| D. No direction information | Only positive amounts | **Do not assume a direction**; ask the user to choose a default or map columns |

Direction red lines:

- Match normalized direction values **exactly**, and maintain a set of **neutral / non-cashflow** values (e.g. "not counted", internal transfer, Transfer, Neutral).
- **Never** use substring checks. A value meaning "not counted as income or expense" often contains the income word and would be misclassified; likewise `Debit`/`Credit` must not be distinguished by first letter alone.
- Neutral rows should be **excluded or flagged separately** — typically refunds, internal transfers, investment redemptions, and repayments.
- Debit/credit semantics may be **inverted** between institutions (account perspective vs bank perspective). **Validate against balance movement or column position**; never assume "debit = expense".

---

## 5. Value cleaning rules

### Amounts

- Strip thousands separators, currency symbols (`¥ ￥ $ € £ HK$` …), whitespace, full-width characters.
- Support parentheses as negative: `(123.45)` → `-123.45`.
- Support trailing unit words.
- **Skip and count** unparseable rows; never drop them silently.

### Dates

- Support many formats: `YYYY-MM-DD`, `YYYY/M/D`, `YYYY.MM.DD`, `YYYYMMDD`, `DD/MM/YYYY`, `MM/DD/YYYY`, datetime `YYYY-MM-DD HH:mm:ss`, and localized forms.
- **`DD/MM` vs `MM/DD` is ambiguous**: infer from the whole column sample (a value >12 in one position settles the order); if it cannot be inferred, ask the user — never silently default.
- Excel date cells are usually **serial numbers** (1900 epoch) and must be converted.

### Text

- Trim whitespace and invisible characters.
- Account/card number fields **must be masked** to the last four digits before storage and display.

---

## 6. Pick the parser by file type (never mix them up)

| File type | You MUST | You MUST NOT |
| --- | --- | --- |
| `.xlsx` / `.xls` | Parse the binary with **SheetJS** (`npm:xlsx`) in the Edge Function, iterating **all worksheets** | Read the binary with `TextDecoder` (guaranteed garbled output) |
| `.csv` / `.txt` | Parse character-by-character with a **state machine**, tracking quote state | `split(',')` (truncates the last column, shifts comma-containing fields) |
| Delimiter variants | Auto-detect the delimiter: `,` `;` `\t` `|` | Assume it is always a comma |
| `.pdf` | Extract text page by page on the frontend with **`pdfjs-dist`**, then structure it via `@Large language Model` | Send an empty-string placeholder |
| Scanned PDF / images | Convert to a spreadsheet first, or ask the user to export CSV | Feed image bytes to the model |

Low-level `.xlsx` red line (if unavoidable): cell text usually lives in `xl/sharedStrings.xml`, and the `5` in `<c t="s"><v>5</v></c>` is an **index, not a value** — it must be dereferenced. SheetJS handles this for you.

---

## 7. Three-tier fallback (the key to supporting arbitrary sources)

**Level 1 — automatic mapping succeeds**: all required concepts matched → import directly, and show the user a summary of detected column → concept mappings for quick confirmation.

**Level 2 — partial detection, interactive column mapping** (must be implemented):
- Show a preview table of the first N parsed rows.
- Give every column a dropdown so the user assigns its meaning (date / amount / direction / merchant / ignore …).
- Remember the mapping per source so the next similar file maps automatically.
- This is the fundamental mechanism for supporting **any wallet or bank**; it must not be skipped.

**Level 3 — completely unrecognized**:
- Optionally send the **header row plus a few sample rows** (masked) to `@Large language Model` for a semantic mapping guess, then have the user confirm.
- Also offer a **generic template CSV** (date, amount, direction, counterparty, description, category) the user can fill in and upload.
- The error must state which step failed.

---

## 8. Edge Function editing red lines

Rewriting an Edge Function easily leaves old code behind, breaking the deploy immediately:

```
InvalidWorkerCreation: worker boot error: Uncaught SyntaxError:
Identifier 'corsHeaders' has already been declared
```

- **MUST overwrite the whole file**; never append a new implementation after the old one.
- After editing, **MUST verify no trailing leftover code** (duplicated top-level constants or `import` statements cause the error above).
- Pre-deploy check: search for `corsHeaders` and each `import` — every one should appear **exactly once**.

---

## 9. Failures must produce actionable errors

- **Never** return garbled or empty results and continue the pipeline.
- Errors must name the **specific blocking step** and the **next action**, for example:
  - "no amount column matched (tried: amount / 金额 / 金额（元）/ debit / credit) — please map the column manually."
  - "header located, but 0 of 128 rows had a parseable amount; the amount column may contain non-numeric content."
  - "no text extracted from the PDF; the file may be a scan — convert it to a spreadsheet or export CSV."
  - "encoding looks like GBK and decoding failed; please re-save as UTF-8 CSV."
- **Never** throw only a generic "please check the file format" — it gives the user nothing to act on and hides the real root cause.

---

## 10. Data integrity and security red lines (apply after import too)

Every rule below is universally correct for financial handling, independent of the source.

### 10.1 Never do money math in floating point

- **MUST** store and accumulate amounts as **integer minor units (cents)** or a decimal type, formatting to major units only in the presentation layer.
- Never accumulate money with JS `number`: `0.1 + 0.2 !== 0.3`, and summing thousands of rows produces cent-level drift that will not reconcile.

### 10.2 Storage and downloads must be private

- Statement files are highly sensitive; **every storage bucket must be private**.
- Serve exported files via **short-lived signed URLs**. **Never use a public bucket** — a public bucket means anyone with the URL can download someone else's statements.

### 10.3 Multi-user data isolation is mandatory

- If the app has login / multiple users, transaction and import-batch tables **MUST enable RLS scoped by `user_id`**.
- All queries must derive identity from the authenticated session; never accept `user_id` from the client as the filter.

### 10.4 Repeat imports must be idempotent

- Importing the same statement twice, or importing two files with overlapping date ranges, is common.
- Prefer the **transaction ID / reference number** as the dedupe key; without one, hash `date + amount + direction + counterparty + description`.
- Enforce a **unique constraint** at the database level; skip and report duplicates rather than silently inserting them.

### 10.5 Internal transfers and refunds must be detected (flagged, never silently deleted)

- **Internal transfers**: moving money from account A to account B produces "one expense + one income" once both accounts are imported, **inflating both totals**. Detect by pairing "same amount, opposite direction, close timestamps, different accounts".
- **Refunds** should be paired against the original expense, otherwise expenses are overstated.
- **Red line**: pairing is heuristic, so results **must be flagged as suspected transfer/refund for user confirmation** — never silently deleted or rewritten.

### 10.6 Credit card statements differ semantically from bank statements

- **A credit card repayment is a transfer, not an expense.** If card transactions are also imported, counting the repayment as an expense double-counts the same spending.
- **Statement cycles** (statement date / due date) do not align with calendar months. Monthly reports must state whether the period is a calendar month or a statement cycle.
- Installment plans need an explicit convention: recognized per installment, or booked in full at purchase. Do not mix the two.

### 10.7 Never sum across currencies

- Amounts in different currencies **must not be summed directly**.
- Group by currency; if conversion is required, state the **exchange-rate source and timestamp**.

### 10.8 Mask data before sending it to the model

- Before passing statement text to `@Large language Model`, **mask it**: keep only the last four digits of account/card numbers, and remove names, national IDs, and phone numbers.
- Send only the fields the analysis needs, not the entire raw file (data minimization).

### 10.9 Validate model structured output

- **Never** regex out a JSON blob and `JSON.parse` it straight into your data path.
- Perform **schema validation** (field presence and types); on failure, retry or fail with a clear error.
- Re-validate numeric values returned by the model before persisting them.

### 10.10 Define a retention policy for uploaded files

- After parsing, there must be an explicit retention policy for the original file (how long it is kept, when it is purged, whether the user can delete it), disclosed in the product.
- Do not retain users' original statement files indefinitely.

---

## 11. Self-check

- [ ] No hardcoded format branch for any single wallet/bank
- [ ] Encoding detection covers UTF-8 (BOM) / GBK / GB18030 / UTF-16
- [ ] Header located by "scan first 30 rows + alias hit scoring", no hardcoded row index
- [ ] One shared normalization function for Excel and CSV, preserving `/`
- [ ] Alias dictionary centralized, extensible, bilingual
- [ ] All four direction modes supported (direction column / two columns / signed / none)
- [ ] Direction values matched exactly; neutral rows excluded; no substring checks
- [ ] Debit/credit semantics validated against balance or column position
- [ ] Amount cleaning covers thousands separators, currency symbols, parenthesized negatives
- [ ] Dates support multiple formats; `DD/MM` vs `MM/DD` ambiguity handled; Excel serials converted
- [ ] CSV parsed with a state machine; delimiter auto-detected
- [ ] `.xlsx` goes through SheetJS; no `TextDecoder` on binary
- [ ] PDF text extracted on the frontend and validated non-empty
- [ ] Level 2 interactive column mapping implemented
- [ ] Account/card numbers masked
- [ ] Edge Function has no duplicated top-level declarations
- [ ] Failures produce specific, actionable errors
- [ ] Money handled as integer cents or decimal; no floating-point accumulation
- [ ] All buckets private; exports served via signed URLs; no public bucket
- [ ] RLS enabled and scoped by `user_id` for multi-user apps
- [ ] Idempotent dedupe key plus a database unique constraint
- [ ] Internal transfers / refunds detected and flagged, never silently deleted
- [ ] Credit card repayments not counted as expenses; report period stated
- [ ] No cross-currency summing
- [ ] Data masked before reaching the model; only necessary fields sent
- [ ] Model output schema-validated, not blindly `JSON.parse`d
- [ ] Retention policy for original files defined
