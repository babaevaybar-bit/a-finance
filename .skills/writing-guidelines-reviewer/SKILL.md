---
name: writing-guidelines-reviewer
description: Reviews docs, tutorials, website copy, help center articles, and pricing pages for clarity, structure, tone, and usability. Use when asked to "review my docs", "check writing style", "audit prose", or "improve clarity".
license: MIT
---

# Writing Guidelines Reviewer

Reviews docs, tutorials, website copy, help center articles, and pricing pages for clarity, structure, tone, and usability.

## When to Use This Skill

**Trigger conditions:**
- User asks to review: "review my docs", "check writing style", "audit prose"
- User says: "review docs voice and tone", "improve clarity"
- User wants to check content against writing guidelines
- User mentions: documentation, tutorial, help center, pricing page

## How It Works

### 1. Fetch Latest Guidelines

Fetch the latest writing guidelines before each review:

```
https://raw.githubusercontent.com/vercel-labs/writing-guidelines/main/command.md
```

Use WebFetch to retrieve the latest rules.

### 2. Analyze Target Content

- Identify document type (product docs, tutorial, landing page, help center)
- Determine target audience (developers, end users, stakeholders)
- Understand user goal (learn, purchase, solve problem)

### 3. Check Against Guidelines

Review for:
- **Clarity** - Direct, specific, helpful language
- **Structure** - Headings, sections, flow
- **Tone** - Voice and appropriate for audience
- **Examples** - Clear, relevant, consistent
- **Terminology** - Consistent, accurate
- **Calls to action** - Clear, persuasive
- **Pricing details** - Specific, clear

### 4. Output Findings

Output findings in the format specified in guidelines (typically `file:line` format).

## Core Features

- Checks whether writing is direct, specific, helpful, and appropriate
- Improves headings, structure, examples, terminology
- Reviews calls to action, pricing details, developer-facing explanations
- Works for product docs, tutorials, landing pages, help centers, marketing content

## Workflow

1. **Analyze** - Target audience, document type, user goal
2. **Identify** - Unclear, verbose, inconsistent, or weak sections
3. **Suggest** - Rewrite suggestions and cleaner final version
4. **Verify** - Improved clarity, structure, tone

## Usage Examples

- "Review this product documentation for clarity and developer readability"
- "Improve this pricing page copy so it is more specific and persuasive"
- "Check a help center article for heading structure, step clarity, terminology"
- "Audit this landing page for tone and calls to action"