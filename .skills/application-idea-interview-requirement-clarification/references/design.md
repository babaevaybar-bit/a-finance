# Phase 3: Design (Specification)

## Overview

Help turn ideas into fully formed designs and specs through natural collaborative dialogue.

Start by understanding the current project context, then ask questions one at a time to refine the idea. Once you understand what you're building, present the design and get user approval.

## When to Use

- User has a refined concept and wants to turn it into a design
- Any creative work begins: creating features, building components, adding functionality, or modifying behavior
- User says: "brainstorm", "design", "let's figure out how to build"

## The Process

### Step 1: Explore Project Context

Check files, docs, recent commits. Understand the current project state first.

If the request describes multiple independent subsystems (e.g., "build a platform with chat, file storage, billing, and analytics"), flag this immediately. Don't spend questions refining details of a project that needs to be decomposed first.

If the project is too large for a single spec, help the user decompose into sub-projects: what are the independent pieces, how do they relate, what order should they be built? Then brainstorm the first sub-project.

### Step 2: Ask Clarifying Questions

Ask questions one at a time. Focus on understanding: purpose, constraints, success criteria.

Prefer multiple choice questions when possible, but open-ended is fine too.

Only one question per message - if a topic needs more exploration, break it into multiple questions.

### Step 3: Propose 2-3 Approaches

Propose 2-3 different approaches with trade-offs. Present options conversationally with your recommendation and reasoning. Lead with your recommended option and explain why.

### Step 4: Present Design

Once you believe you understand what you're building, present the design.

Scale each section to its complexity: a few sentences if straightforward, up to 200-300 words if nuanced.

Ask after each section whether it looks right so far.

Cover: architecture, components, data flow, error handling, testing.

Be ready to go back and clarify if something doesn't make sense.

### Step 5: Write Design Doc

Write the validated design (spec) to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` (or user-preferred location).

Commit the design document to git.

### Step 6: Spec Self-Review

After writing the spec document, look at it with fresh eyes:

1. **Placeholder scan:** Any "TBD", "TODO", incomplete sections, or vague requirements? Fix them.
2. **Internal consistency:** Do any sections contradict each other? Does the architecture match the feature descriptions?
3. **Scope check:** Is this focused enough for a single implementation plan, or does it need decomposition?
4. **Ambiguity check:** Could any requirement be interpreted two different ways? If so, pick one and make it explicit.

Fix any issues inline. No need to re-review — just fix and move on.

### Step 7: User Reviews Spec

Ask the user to review the written spec before proceeding:

> "Spec written and committed to `<path>`. Please review it and let me know if you want to make any changes before we start writing out the implementation plan."

Wait for the user's response. If they request changes, make them and re-run the spec review loop. Only proceed once the user approves.

### Step 8: Transition to Implementation

After design is approved, invoke the writing-plans skill to create a detailed implementation plan.

**The terminal state is invoking writing-plans.** Do NOT invoke any implementation skill directly.

## Design for Isolation and Clarity

- Break the system into smaller units that each have one clear purpose, communicate through well-defined interfaces, and can be understood and tested independently
- For each unit, you should be able to answer: what does it do, how do you use it, and what does it depend on?
- Can someone understand what a unit does without reading its internals? Can you change the internals without breaking consumers? If not, the boundaries need work.
- Smaller, well-bounded units are also easier for you to work with

## Anti-Pattern: "This Is Too Simple To Need A Design"

Every project goes through this process. A todo list, a single-function utility, a config change — all of them. "Simple" projects are where unexamined assumptions cause the most wasted work. The design can be short (a few sentences for truly simple projects), but you MUST present it and get approval.

## Hard Gate

Do NOT invoke any implementation skill, write any code, scaffold any project, or take any implementation action until you have presented a design and the user has approved it. This applies to EVERY project regardless of perceived simplicity.

## Key Principles

- **One question at a time** - Don't overwhelm with multiple questions
- **Multiple choice preferred** - Easier to answer than open-ended when possible
- **YAGNI ruthlessly** - Remove unnecessary features from all designs
- **Explore alternatives** - Always propose 2-3 approaches before settling
- **Incremental validation** - Present design, get approval before moving on
- **Be flexible** - Go back and clarify when something doesn't make sense

## Verification

After applying design:

- [ ] Project context was explored
- [ ] Clarifying questions were asked one at a time
- [ ] 2-3 approaches were proposed with trade-offs
- [ ] Design was presented and user approved
- [ ] Design doc was written and committed
- [ ] Spec self-review was performed
- [ ] User reviewed the spec
- [ ] Transitioned to writing-plans skill