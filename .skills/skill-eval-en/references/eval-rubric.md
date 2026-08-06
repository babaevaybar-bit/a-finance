# Skill-Eval English Scoring Rules and Report Template

## How to Use This File

When reviewing a local skill, first read the target files, then apply these checks and return an evidence-based judgment. Unless you have real runtime logs, only report bands and reasons; do not invent exact token counts or benchmark results.

## 1. Single Skill Review Checklist

| Dimension | Check | Risk Signal | Suggested Severity |
|-----------|-------|-------------|--------------------|
| Frontmatter | Does it include `name`, `description`, `license`, and, when needed, `packageType: instruction-skill` plus `instructionOnly: true`? | Missing fields, inconsistent names, or a type declaration that does not match the actual skill | high / medium |
| Trigger description | Does it say what the skill does and when to use it? | Only lists purpose, does not mention trigger phrases, or is so long that it inflates trigger cost | high / medium |
| Naming consistency | Do the directory name, frontmatter `name`, and references line up? | Users cannot find or invoke the target consistently | medium |
| Body structure | Does it include prerequisites, core capabilities, execution priorities, references, communication rules, and common pitfalls? | Missing structure makes execution less reliable | medium |
| Progressive disclosure | Is the main file focused on the workflow, with detail pushed into `references/`? | `SKILL.md` becomes too heavy and costly to load | medium |
| Evidence and citations | Does the skill require file paths and line numbers for important claims? | Findings become hard to trace | medium |
| Links and paths | Do references, assets, and scripts point to real files? | Runtime lookup failures or unusable templates | high / medium |
| Type fit | Does the skill match the expected structure for pure instruction, API integration, or MCP/CLI work? | A pure instruction skill asks for an unavailable runtime, or an API skill omits key setup rules | high |
| Safety and boundaries | Does it avoid leaking secrets, faking execution, or promising results it cannot produce? | Claims of unrun work, secret exposure, or misleading guidance | high |

## 2. Skill Package Review Checklist

| Dimension | Check | Risk Signal | Suggested Severity |
|-----------|-------|-------------|--------------------|
| Package structure | Can the root, multiple skill folders, and shared materials be identified clearly? | Multiple entry points are confusing or the target is unclear | medium |
| Role boundaries | Does each skill have a clear purpose? | Multiple skill descriptions overlap heavily and can trigger the wrong one | high / medium |
| Routing entry | Is there a clear umbrella entry or selection rule? | Users do not know which skill to call | medium |
| Shared references | Are shared materials centralized and skill-specific details isolated? | Cross-contamination or unstable paths | medium |
| Naming rules | Do directory names, frontmatter names, and visible names stay aligned? | Installation, invocation, or publishing mismatches | high / medium |
| Size control | Is the main file lean, with long templates moved out? | Invocation cost rises and response quality drops | medium |

## 3. Token / Context Budget Buckets

| Bucket | Meaning | Good | Moderate | Heavy |
|--------|---------|------|----------|-------|
| Trigger | Content that may enter context before explicit invocation, such as the name and description | ≤48 | ≤92 | ≤150 |
| Invoke | The main instruction body loaded after invocation | ≤220 | ≤480 | ≤900 |
| Deferred | References, scripts, assets, and other large material loaded only when needed | ≤180 | ≤520 | ≤1200 |

Interpretation rules:
- Without a reliable tokenizer, do not give exact token counts; estimate by content length and structure.
- A long description affects the trigger bucket first.
- A large `SKILL.md` body affects the invoke bucket first.
- Big reference files belong in deferred content and should not be pushed into the main file.

## 4. Score Bands

| Band | Meaning | Typical State |
|------|---------|---------------|
| A | Low risk, ready to use | Complete frontmatter, clear trigger, reasonable structure, light budget, valid paths |
| B | Minor issues, worth polishing | Small maintainability or trigger issues that do not block use |
| C | Moderate risk, should be fixed | Structural gaps, unclear triggers, budget pressure, or reference problems |
| D | High risk, should be repaired before use | Missing key fields, confusing entry points, broken paths, or boundary mistakes |
| F | Not recommended | No clear entry, severe misdirection, missing critical files, or unsafe behavior |

## 5. riskLevel Rules

| riskLevel | Rule |
|-----------|------|
| low | Issues are mainly polish items and do not block normal use |
| medium | Trigger, structure, path, or budget issues may affect reliable use |
| high | The skill has unusable entry points, missing critical information, misleading behavior, secret exposure, or other major problems |

## 6. Default Report Template

```markdown
## At a Glance
| Item | Band / Conclusion | Evidence |
|------|-------------------|----------|
| Overall band | A/B/C/D/F | path:line |
| Risk level | low/medium/high | path:line |
| First fix | one-sentence summary | path:line |
| Budget pressure | good/moderate/heavy | path:line |

## Why It Matters
- Explain how the issue affects trigger accuracy, context cost, maintainability, user outcomes, or publish quality.

## Fix First
| Priority | Severity | Problem | Evidence | Smallest Fix |
|----------|----------|---------|----------|--------------|
| 1 | high/medium/low | ... | path:line | ... |

## Recommended Next Step
- Give one smallest actionable next step.
```

## 7. Rewrite Brief Template

```markdown
# Skill Rewrite Brief

## Objective
- The core issue this rewrite should solve.

## Must Fix
1. Problem: ...
   - Evidence: path:line
   - Change: ...
   - Acceptance: ...

## Recommended Fixes
1. Problem: ...
   - Evidence: path:line
   - Change: ...

## Keep
- List the existing good parts that should remain.

## Recheck List
- [ ] frontmatter is complete
- [ ] trigger description is clear
- [ ] `SKILL.md` stays lean
- [ ] references paths are valid
- [ ] static estimates and real measurements are clearly separated
```

## 8. Custom Scoring Dimension Template

| Field | Meaning |
|-------|---------|
| id | Stable rule ID that can be rechecked later |
| category | Rule category, such as trigger, budget, structure, or security |
| severity | high / medium / low |
| status | pass / warn / fail / unknown |
| evidence | File paths, line numbers, and observed facts |
| remediation | The smallest repair action |

Example:

```json
{
  "id": "trigger.description.too-broad",
  "category": "trigger",
  "severity": "medium",
  "status": "warn",
  "evidence": ["SKILL.md:3 description covers unrelated scenarios at once"],
  "remediation": ["Narrow the trigger text to the tasks the skill can actually handle"]
}
```

## 9. Local Measurement Guidance

When the user asks for a real measurement, provide a plan instead of fabricating results:

1. Collect 3-5 representative real scenarios.
2. Record the input, expected output, and skill version for each scenario.
3. Run a dry run in a local executable environment to verify that paths, network usage, and destructive actions are safe.
4. Run the measurement and save usage logs, timing, outputs, and errors.
5. Show the measured result next to the static estimate and note the sample size and limitations.
6. Use the difference to improve trigger text, main file size, references splitting, and example scenarios.

When reporting real measurements, always state:
- sample count
- whether the run was cold start
- whether caching was present
- whether reasoning tokens or output tokens are included
- whether the estimate gap is stable across runs
