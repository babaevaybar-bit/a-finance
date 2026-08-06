---
name: spec-driven-documentation
description: Unified workflow combining document co-authoring and spec-driven development. Use when creating documents, proposals, RFCs, technical specs, or when user says "write a doc", "draft", "create a spec", "specification".
license: MIT
---

# Spec-Driven Documentation Workflow

This unified skill combines two complementary workflows for creating professional documentation: document co-authoring and spec-driven development. Use a routing mechanism to direct users to the appropriate workflow based on their needs.

## When to Use This Skill

**Trigger conditions:**
- User mentions writing: "write a doc", "draft", "create a spec", "document"
- User mentions specific doc types: "PRD", "design doc", "RFC", "specification"
- User is starting a substantial writing or documentation task
- User wants to turn ideas into implementable specifications

## Quick Decision

**Question: What are you creating?**

| If... | Go to... |
|------|---------|
| I need to write a document (proposal, RFC, guide) | Phase 1: Document Co-Authoring |
| I need to create a technical spec for implementation | Phase 2: Spec-Driven Development |

## Phase 1: Document Co-Authoring

**Purpose:** Collaborative document creation for proposals, RFCs, guides, and decision documents.

**When:**
- User wants to create a document for human readers (stakeholders, team, external)
- Focus is on content, structure, and clarity
- User says: "write a doc", "draft a proposal", "create an RFC"

**Output:** Complete document with structured sections

**Read:** `references/doc-coauthoring.md`

## Phase 2: Spec-Driven Development

**Purpose:** Turn requirements into implementable technical specifications.

**When:**
- User needs to specify features for development
- Focus is on technical implementation details
- User says: "spec", "specification", "feature spec", "technical spec"

**Output:** Technical specification document ready for implementation

**Read:** `references/spec-driven.md`

## Routing Logic

```
User request
     │
     ▼
Is this for implementation?
     │
    ├─YES─→ Spec-Driven Development (Phase 2)
    │
    └─NO──→ Document Co-Authoring (Phase 1)
```

## Key Principles

- **Clarify before writing** — Ensure understanding of purpose and audience
- **Structure first** — Agree on document structure before drafting
- **Iterative refinement** — Present drafts, get feedback, iterate
- **Living documents** — Keep specs updated as decisions change