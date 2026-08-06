# Document Co-Authoring

This skill provides a structured workflow for guiding users through collaborative document creation. Act as an active guide, walking users through three stages: Context Gathering, Refinement & Structure, and Reader Testing.

## Stage 1: Context Gathering

**Goal:** Collect all relevant context from the user before writing begins.

### Initial Offer

Offer the user a structured workflow for co-authoring the document. Explain the three stages:

1. **Context Gathering**: You provide all relevant context while I ask clarifying questions
2. **Refinement & Structure**: We agree on structure and iterate on content
3. **Reader Testing**: Test the document with representative readers

### What to Collect

Ask the user to provide:
- Document purpose and intended audience
- Existing information, notes, or drafts
- Key points that must be covered
- Examples or references they want to draw from

### Handling Context

- If user provides links to documents:
  - If you have access to tools: Use them to fetch the content
  - If no access: Ask user to paste relevant content

- If user mentions team channels or shared documents:
  - If integrations available: Inform them the content will be read
  - If no integrations: Explain lack of access, suggest pasting content

- If user mentions unknown entities/projects:
  - Ask if connected tools should be searched
  - Wait for confirmation before searching

### Asking Clarifying Questions

When user signals they've done their initial dump, ask clarifying questions:

Generate 5-10 numbered questions based on gaps in the context. Prioritize:
1. Audience — Who will read this?
2. Purpose — What should readers know or do after?
3. Scope — What's in/out of bounds?
4. Key decisions — Any constraints or requirements?
5. Success — How will we know this succeeded?

Present as numbered questions. Ask user to select by number.

## Stage 2: Refinement & Structure

**Goal:** Agree on document structure before drafting.

### Propose Structure

Based on document type and collected context, suggest 3-5 sections appropriate for the document.

If user doesn't know what sections they need:
- Suggest sections based on document type
- Ask if structure works or needs adjustment

### Create Document Scaffold

Once structure is agreed:
- Create initial document structure with placeholder text for all sections
- Use artifacts if available for collaborative editing

### Drafting Process

For each section:
1. Announce section being drafted
2. Present draft based on user context and selections
3. Ask for feedback
4. Iterate until approved

### Feedback Handling

**If user gives numbered selections:**
- Combine selected options
- Apply requested changes

**If user gives freeform feedback:**
- Parse preferences and apply
- Confirm changes before proceeding

### Gap Check

After drafting each section, ask if anything important is missing.

## Stage 3: Reader Testing

**Goal:** Validate document with representative readers.

### Testing Approach

- Share document with 2-3 representative readers
- Gather feedback on:
  - Clarity and comprehension
  - Actionability (if applicable)
  - Missing gaps
  - Tone and voice

### Iteration

Incorporate feedback and iterate until document meets needs.

## Document Types

### Proposal
- Problem statement
- Proposed solution
- Benefits and tradeoffs
- Timeline and resources
- Success metrics

### RFC (Request for Comments)
- Summary
- Background and motivation
- Detailed design
- Alternatives considered
- Open questions

### Decision Doc
- Context and background
- Decision made
- Rationale
- Alternatives
- Consequences

### Guide/How-to
- Prerequisites
- Step-by-step instructions
- Examples
- Troubleshooting

### Technical Documentation
- Overview
- API/interface details
- Usage examples
- Edge cases