# App Integration Rules (Generating a Fitness Application)

These are **hard requirements** for any application generated from this skill. They are deliberately concrete so the generated app is correct on the first pass.

---

## 1. Platform skill integration matrix

Integrate these at **generation time**; do not reimplement their capabilities by hand.

**Mind the "Applies when" column**: a skill is only required if the app actually has that feature. **Do not add features the app does not need just to satisfy this table.**

| Need | MUST integrate | Applies when | Notes |
| --- | --- | --- | --- |
| Generate program / review / recommendation text | `@Large language Model` | **Always** | Never wire up a model API yourself |
| Export a plan to Word | `@Word` | Only if Word export exists | Never hand-roll `.docx` generation |
| Export / print a plan to PDF | `@PDF` | Only if PDF export/print exists | Never hand-roll `.pdf` generation |
| Import or export training logs (`.xlsx` / `.csv`) | `@Excel` | Only if spreadsheet import/export exists | Parsing must follow section 2 |

Not required: image-generation skills for exercise demonstrations (generated form images can be misleading and unsafe — use text cues, or curated media the product owns).

Progress charts should be rendered client-side with a standard charting library; do not pull in a data-analysis pipeline for simple charts.

> The core loop of most fitness apps is "collect inputs → generate a plan → display → log → review". Only **text generation** is mandatory there. Export and spreadsheet import are optional features — if the app does not have them, do not add them.

---

## 2. File parsing and export red lines

| File type | You MUST | You MUST NOT |
| --- | --- | --- |
| `.xlsx` / `.xls` | Parse the binary with **SheetJS** (`npm:xlsx`) server-side (Edge Function) | Read the binary with `TextDecoder` (guaranteed garbled output) |
| `.csv` | Parse character-by-character with a **state machine**, tracking quote state; auto-detect the delimiter | `split(',')` |
| `.pdf` | Extract text page by page with **`pdfjs-dist`** before any model call, and **validate the text is non-empty** | Pass an empty-string placeholder to the model |
| `.docx` | Go through `@Word` | Decode the ZIP bytes as UTF-8 |

Additional rules:

- `.xlsx` and `.docx` are **ZIP + XML** containers. They must be decompressed; raw bytes are never text.
- Header rows are not guaranteed to be the first row. Scan the first rows and locate the header by matching known column concepts; never hardcode a row index.
- Normalize column names before matching (strip parenthetical content, trim whitespace, lowercase) and fuzzy-match against an extensible alias list.
- On failure, raise a **specific, actionable** error (which column was missing, which step failed). Never throw a generic "invalid file format", and never continue the pipeline with garbled or empty content.

---

## 3. Storage and data isolation

- **All storage buckets must be private.** Serve exported plans via **short-lived signed URLs**; never use a public bucket.
- If the app has login / multiple users, training logs, plans, and body metrics **MUST use RLS scoped by `user_id`**.
- Derive identity from the authenticated session. Never accept `user_id` from the client as a filter.

---

## 4. Model output validation

- **Never** regex a JSON blob out of the model response and `JSON.parse` it straight into your data path.
- Perform **schema validation** (field presence and types). On failure, retry or fail with a clear error.
- Validate numeric fields (sets, reps, load, duration) for plausible ranges before persisting or displaying them.

---

## 5. Health data compliance

Health and physiological data is **sensitive personal information**.

- Require **explicit, separate consent** before collecting body metrics, injury history, or health conditions.
- **Data minimization**: do not collect weight, body-fat, or measurements by default; make them optional.
- Provide **deletion and export** of the user's own data.
- Define and disclose a **retention policy**.
- **Mask or omit** identifying details before sending any content to `@Large language Model`; send only what the plan requires.

---

## 6. Safety notices that MUST appear in the UI

These cannot live only inside prompts — they must be rendered in the application.

1. **Disclaimer**, visible on first run and on plan pages:

   > This is general fitness education and planning support, not medical advice, physical therapy, diagnosis, or a substitute for an in-person coach.

2. **Stop-exercising warning**, persistently accessible:

   > Stop exercising and seek medical help for chest pain, fainting, severe shortness of breath, sudden dizziness, acute injury, or unusual severe pain.

3. **Clinician confirmation prompt** for users who report chronic conditions, pregnancy/postpartum status, recent surgery, or significant injuries.

---

## 7. Content prohibitions (enforce at generation time)

- **No outcome promises**: never state a specific amount of fat loss, muscle gain, or performance improvement, in UI copy or generated content.
- **No PED / steroid / banned-substance protocols**, in any form.
- **No training through sharp pain**, chest pain, neurological symptoms, or acute injury.
- **No extreme calorie restriction, dehydration, stimulant, or disordered-eating guidance.**
- **No max-effort programming for beginners.**
- Do not diagnose injuries, prescribe rehabilitation, or override clinician instructions.

---

## 8. Self-check

- [ ] Text generation goes through `@Large language Model`; no hand-wired model API
- [ ] Word / PDF export goes through `@Word` / `@PDF`
- [ ] `.xlsx` parsed with SheetJS; no `TextDecoder` on binary
- [ ] CSV parsed with a state machine; delimiter auto-detected
- [ ] PDF text extracted with `pdfjs-dist` and validated non-empty
- [ ] Header row located by scanning + alias matching; no hardcoded row index
- [ ] All buckets private; exports via signed URLs
- [ ] RLS scoped by `user_id` for multi-user apps
- [ ] Model output schema-validated; numeric ranges checked
- [ ] Separate consent for health data; body metrics optional; deletion supported
- [ ] Disclaimer and stop-exercising warning rendered in the UI
- [ ] No outcome promises, no PED content, no train-through-pain guidance
- [ ] Failures produce specific, actionable errors
