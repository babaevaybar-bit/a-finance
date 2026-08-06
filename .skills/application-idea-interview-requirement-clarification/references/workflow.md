# Ideation Workflow

## Three Phases

The unified skill routes to one of three phases based on where the user is in their ideation journey.

## Phase Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        IDEATION WORKFLOW                                    │
└─────────────────────────────────────────────────────────────────────────────┘

                                    ┌──────────────────┐
                                    │   USER REQUEST   │
                                    └────────┬────────┘
                                             │
                                             ▼
                        ┌───────────────────────────────────────┐
                        │  Where is the user in their journey?  │
                        └───────────────────┬───────────────────┘
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    │                       │                       │
                    ▼                       ▼                       ▼
           ┌────────────────┐      ┌────────────────┐      ┌────────────────┐
           │   PHASE 1:    │      │   PHASE 2:     │      │   PHASE 3:    │
           │   INTERVIEW   │      │   REFINE       │      │   DESIGN      │
           │              │      │               │      │               │
           │ Intent       │      │ Concept       │      │ Design       │
           │ Extraction   │────▶│ Refinement    │────▶│ Specification│
           └──────────────┘      └───────────────┘      └───────────────┘
                    │                       │                       │
                    │  Confirmed Intent     │  Refined Concept     │  Approved Design
                    │                       │                       │
                    ▼                       ▼                       ▼
            ┌──────────────┐      ┌───────────────┐      ┌───────────────┐
            │ Output:      │      │ Output:      │      │ Output:      │
            │ Confirmed    │      │ Refined     │      │ Design Spec │
            │ Statement   │      │ Concept    │      │ Document    │
            │ of Intent   │      │ One-Pager  │      │             │
            └──────────────┘      └───────────────┘      └───────────────┘
```

## Decision Tree

### Start Here: Which phase do I use?

**Q: What's the state of the user's request?**

| If the request... | Use Phase... | Read |
|-----------------|--------------|------|
| Is missing: who, why, success criteria, or constraint | Interview | `references/interview.md` |
| Is vague but user wants to explore options | Refine | `references/refine.md` |
| Is already a clear concept needing design | Design | `references/design.md` |

### Phase 1: Interview - When to use

**Trigger conditions:**

- The ask is missing: who, why, success criteria, or constraint
- User says: "interview me", "grill me", "are we sure?"
- You're tempted to assume requirements you haven't surfaced
- Request is conventional ("build me X") without specifics

**Stop condition:**

- You can predict the user's reaction to the next 3 questions (95% confidence)

**Output:** Confirmed statement of intent

### Phase 2: Refine - When to use

**Trigger conditions:**

- User has clear intent but idea is vague
- User says: "ideate", "refine this idea", "stress-test my plan"
- Need to expand options before converging

**Stop condition:**

- User confirms a direction and "Not Doing" list

**Output:** Refined concept one-pager

### Phase 3: Design - When to use

**Trigger conditions:**

- User has a refined concept
- Any creative work begins
- User says: "brainstorm", "design", "let's figure out how to build"

**Stop condition:**

- User approves the design spec

**Output:** Design specification document

## Phase Connections

### Phase 1 → Phase 2

When Phase 1 output (confirmed intent) is too vague, hand off to Phase 2:

```
"I've clarified what you want: [restate]. Now let's refine this into a sharper concept."
```

### Phase 2 → Phase 3

When Phase 2 output (refined concept) is ready, hand off to Phase 3:

```
"We have a strong concept: [direction]. Now let's design the spec."
```

### Phase 3 → Implementation

After Phase 3 output (design spec) is approved:

```
"Design approved. Let me create the implementation plan."
```

## Key Points

1. **Mutually exclusive triggers** - Each phase has clear trigger conditions that don't overlap
2. **Sequential flow** - Phase 1 → Phase 2 → Phase 3, but can skip phases if user is already further along
3. **User approval gate** - Each phase ends with explicit user confirmation before moving on
4. **No code before design** - Never write implementation code before Phase 3 design is approved