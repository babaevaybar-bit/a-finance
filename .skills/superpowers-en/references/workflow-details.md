# Superpowers Workflow Discipline Details

> This file condenses the discipline points, gates, and red-flag checklists of each Superpowers workflow, referenced by the main SKILL.md. Core philosophy: test first, systematic over ad-hoc, minimize complexity, evidence over claims.

---

## 1. Test-Driven Development (TDD) Details

### The Iron Law
```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.
```
Write the test first → watch it fail → write minimal code to pass. If you didn't watch the test fail, you don't know whether it tests the right thing.

### Red-Green-Refactor Cycle
1. **RED — write failing test**: one test for one behavior, clear name, real code (mocks only if unavoidable).
2. **Verify RED (mandatory)**: run it, confirm it **fails** (not errors), and fails because the feature is missing (not a typo). Test passes immediately = you're testing existing behavior; fix the test.
3. **GREEN — minimal code**: write just enough to pass; no extra features, no incidental refactoring, no "improvements".
4. **Verify GREEN (mandatory)**: test passes, other tests still pass, output pristine (no errors/warnings).
5. **REFACTOR**: only after green — remove duplication, improve names, extract helpers; stay green, add no behavior.

### If code was written before the test
Delete it. Start over. Don't keep it as "reference", don't "adapt" it, don't look at it. Delete means delete.

### Common Rationalizations
| Excuse | Reality |
|--------|---------|
| "Too simple to test" | Simple code breaks; the test takes 30 seconds |
| "I'll test after" | Tests written after pass immediately and prove nothing |
| "Already manually tested" | Ad-hoc ≠ systematic; no record, can't re-run |
| "Deleting hours of work is wasteful" | Sunk cost fallacy; keeping untrusted code is technical debt |
| "TDD is dogmatic, I'm pragmatic" | TDD IS pragmatic: test-first beats debugging after |
| "Hard to test = unclear design" | Listen to the test; hard to test = hard to use; simplify the interface |

---

## 2. Systematic Debugging Details

### The Iron Law
```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.
```
Symptom fixes are failure. Random trial-and-error wastes time and creates new bugs.

### Four Phases (complete each before the next)
1. **Phase 1 — Root cause investigation**: read error messages and full stack traces carefully (often contain the exact answer); reproduce consistently; pin down the exact line/file/error code.
2. **Phase 2 — Hypothesis and verification**: form a hypothesis about the root cause and test it with a minimal experiment before changing anything.
3. **Phase 3 — Minimal fix**: make the smallest change that addresses the root cause; don't fix unrelated things.
4. **Phase 4 — Verification**: confirm the problem is gone, no regressions, output pristine.

### Companion Techniques
- **Root-cause tracing**: trace backward from symptom to source; don't stop at the first place you can change.
- **Defense in depth**: add validation at multiple layers, but locate the root cause first.
- **Condition-based waiting**: replace sleeps with condition polling to remove timing flakiness.

When a bug is found, first write a failing test that reproduces it, then follow the TDD cycle — the test both proves the fix and prevents regression.

---

## 3. Brainstorming and Design Gate

### Hard Gate
```
Do NOT write code, scaffold, or invoke any implementation skill until you present a design and the user approves it.
```
Every project goes through this, including "simple" ones. Simple projects are exactly where unexamined assumptions cause the most rework. The design can be short, but you MUST present it and get approval.

### Checklist (create a task per item, complete in order)
1. Explore project context (files, docs, recent commits)
2. Offer the visual companion as its own message when visual content is coming
3. Ask clarifying questions one at a time (prefer multiple choice)
4. Propose 2-3 approaches with trade-offs and a recommendation
5. Present the design in sections, get approval per section
6. Write and commit the design document
7. Spec self-review (placeholders/contradictions/ambiguity/scope)
8. User reviews the written spec
9. Transition to the writing-plans skill

---

## 4. Writing Plans and Execution

### Writing Plans
- Assume the implementer is skilled but knows nothing about this project, has questionable taste, and avoids testing.
- Break work into 2-5 minute single-action tasks: write failing test → run to confirm failure → write minimal implementation → run tests to confirm pass → commit.
- Give each task exact file paths, complete code, verification steps. DRY, YAGNI, TDD, frequent commits.
- Plan the file structure first: each file has one responsibility; things that change together live together.

### Executing Plans / Subagent-Driven Development
- Dispatch a fresh subagent per task with two-stage review: spec compliance first, then code quality.
- Set human checkpoints for batch execution.
- 2+ independent tasks with no shared state or sequential dependency → use parallel subagents.

---

## 5. Code Review

### Requesting Review
On completing tasks, major features, or before merging, review against the plan and report issues by severity. Critical issues block progress.

**Severity levels:**
- **Critical**: correctness/security/data-loss risk; must fix before continuing.
- **Major**: clear deviation from plan or design flaw; should fix.
- **Minor**: style/readability; address opportunistically.

### Receiving Review
Respond with technical rigor, no performative agreement and no blind implementation. When feedback is unclear or technically questionable, verify before implementing.

---

## 6. Verification Before Completion

### Principle
```
Evidence before assertions, always.
```
Before claiming "complete/fixed/passing", actually run verification commands and confirm the output, then make any success claim. Never say "should be fine" without running verification.

### Checklist
- [ ] Ran the relevant tests/build and pasted the real output
- [ ] Output pristine (no errors, no warnings)
- [ ] Edge cases and errors covered
- [ ] Every claim has corresponding evidence

---

## 7. Finishing a Development Branch

Once implementation is complete and tests pass, present structured options: merge / open PR / keep branch / discard. After confirmation, clean up the worktree. Don't decide the merge strategy unilaterally.

---

## 8. Writing Skills (Meta-Skill)

When creating/editing skills, follow best practices: precise triggering descriptions; content testable by subagents; tone matched to the skill type's discipline (rigid vs flexible). Test with subagents before deployment to verify triggering and execution.

---

## 9. Red Flags / Rationalizations (spot self-deception)

These thoughts mean STOP — you're rationalizing skipping the process:

| Thought | Reality |
|---------|---------|
| "This is just a simple question" | A question is a task; check for skills first |
| "I need context first" | Skill check comes before clarifying questions |
| "Let me explore the codebase first" | Skills tell you how to explore; check first |
| "This doesn't need a formal process" | If a skill exists, use it |
| "Skip TDD just this once" | That's rationalization; delete and restart |
| "I'll just do this one thing first" | Check before doing anything |
| "I remember this skill" | Skills evolve; read the current version |
| "Just patch the symptom" | No root cause = failure |
| "Should be fixed" | No verification run = no completion claim |

### Priority
```
User's explicit instructions (highest) > Superpowers skills > default system behavior (lowest)
```
User instructions say WHAT, not "skip the process". But if the user explicitly says "don't use TDD", follow the user — the user is always in control.

### Skill Types
- **Rigid** (TDD, debugging): follow exactly; don't adapt the discipline away.
- **Flexible** (patterns): adapt the principles to context.
The skill itself tells you which.
