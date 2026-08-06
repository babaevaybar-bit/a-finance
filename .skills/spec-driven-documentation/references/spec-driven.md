# Spec-Driven Development

A structured workflow for turning requirements into implementable specifications.

## Phase 1: Specify

Start with a high-level vision. Ask clarifying questions until requirements are concrete.

### Surface Assumptions

Before writing any spec content, list what you're assuming:

```
ASSUMPTIONS I'M MAKING:
1. This is a web application (not native mobile)
2. Authentication uses session-based cookies (not JWT)
3. The database is PostgreSQL
4. We're targeting modern browsers only (no IE11)
→ Correct me now or I'll proceed with these.
```

Ask user to confirm or correct assumptions.

### Define Scope

- What's in scope?
- What's out of scope?
- Key constraints (timeline, budget, technical)

### Success Criteria

Define measurable success conditions:
- What does "done" look like?
- How will we verify success?

## Phase 2: Plan

Create a reviewable plan before implementation.

### Plan Template

```markdown
# Plan: [Project/Feature Name]

## Approach
[High-level strategy, key decisions]

## Phases
1. Phase: [Description]
   - Deliverable: [What]
   - Verification: [How to confirm]

2. Phase: [Description]
   - ...

## Open Questions
[Anything needing human input]
```

### Plan Characteristics

- Reviewable by humans
- Clear phase boundaries
- Verification checkpoints
- Dependencies identified

## Phase 3: Tasks

Break the plan into discrete, implementable tasks.

### Task Template

```markdown
- [ ] Task: [Description]
- Acceptance: [What must be true when done]
- Verify: [How to confirm — test command, build, manual check]
- Files: [Which files will be touched]
```

### Task Guidelines

- Each task completable in one focused session
- Each task has explicit acceptance criteria
- Each task includes verification step
- Tasks ordered by dependency
- No task should require changing >5 files

## Phase 4: Implement

Execute tasks following incremental implementation best practices.

### Context Engineering

Load the right spec sections and source files at each step:
- Don't flood with entire spec
- Load relevant sections per task
- Keep context focused

### Keeping the Spec Alive

- Update when decisions change
- Update when scope changes
- Keep spec in version control with code

## Spec Template

```markdown
# Spec: [Project/Feature Name]

## Objective
[What we're building and why. User stories or acceptance criteria.]

## Tech Stack
[Framework, language, key dependencies with versions]

## Commands
[Build, test, lint, dev — full commands]

## Project Structure
[Directory layout with descriptions]

## Code Style
[Example snippet + key conventions]

## Testing Strategy
[Framework, test locations, coverage requirements]

## Boundaries
- Always: [...]
- Ask first: [...]
- Never: [...]

## Success Criteria
[How we'll know this is done]

## Open Questions
[Anything unresolved]
```

## Workflow Diagram

```
SPECIFY ──→ PLAN ──→ TASKS ──→ IMPLEMENT
│        │        │        │
▼        ▼        ▼        ▼
Human   Human   Human   Human
reviews reviews reviews reviews
```

## Key Principles

- **One question at a time** — Don't overwhelm
- **Clarify before writing** — Ensure understanding
- **Incremental validation** — Get approval before moving on
- **YAGNI** — Remove unnecessary features
- **Living spec** — Keep updated as decisions change