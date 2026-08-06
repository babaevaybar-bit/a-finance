---
name: application-idea-interview-requirement-clarification
description: Unified ideation workflow that helps extract requirements, refine concepts, and create designs through three phases. Use when exploring ideas, clarifying requirements, designing features, or when the user says "interview", "brainstorm", "ideate", "refine", "requirement", or "clarify".
license: MIT
---

# Application Idea Interview & Requirement Clarification

Your guide to turning ideas into actionable designs through three phases.

## Quick Decision

Answer this question: **Where are you in your ideation journey?**

| If... | Go to... | Read |
|-------|---------|------|
| I don't know what I want | Phase 1: interview | `references/interview.md` |
| I know what I want but it's vague | Phase 2: refine | `references/refine.md` |
| I have a clear concept, now I need a design | Phase 3: design | `references/design.md` |

## Phase 1: Interview (Intent Extraction)

**When:** The ask is missing key information.

- The request is missing: who, why, success criteria, or constraint
- User says: "interview me", "grill me", "are we sure?", "stress-test my thinking"
- You're tempted to assume requirements you haven't surfaced

**Output:** Confirmed intent statement

**Read:** `references/interview.md`

> "I want a dashboard" → we need to discover what problem you're trying to solve

## Phase 2: Refine (Concept Refinement)

**When:** You know what you want but it's vague.

- User has a clear intent but the idea is fuzzy
- User says: "ideate", "refine this idea", "stress-test my plan"
- Need to expand options before converging

**Output:** Refined concept with assumptions

**Read:** `references/refine.md`

> "I want to track experiments" → let's expand options and find the best approach

## Phase 3: Design (Specification)

**When:** You have a concept and need a design.

- User has a refined concept and wants to turn it into a design
- Any creative work begins
- User says: "brainstorm", "design", "let's figure out how to build"

**Output:** Design specification document

**Read:** `references/design.md`

> "I want a personal experiment tracker for standups" → let's design the spec

## How Phases Connect

```
Phase 1 output (confirmed intent)
         ↓
Phase 2 input (explicit intent to refine)
         ↓
Phase 2 output (refined concept)
         ↓
Phase 3 input (concept to design)
         ↓
Phase 3 output (design spec)
         ↓
writing-plans skill (implementation)
```

See `references/workflow.md` for the complete workflow diagram and decision tree.

## Key Principles

- **One question at a time** - Don't overwhelm with multiple questions
- **Multiple choice preferred** - Easier to answer than open-ended when possible
- **YAGNI ruthlessly** - Remove unnecessary features from all designs
- **Explore alternatives** - Always propose 2-3 approaches before settling
- **Incremental validation** - Present design, get approval before moving on
- **Be flexible** - Go back and clarify when something doesn't make sense

## Anti-Patterns to Avoid

- Three or more questions in a single message (that's batching, not exploring)
- Skipping the "who is this for" question
- Producing a spec without user confirmation
- Jumping straight to implementation before design is approved