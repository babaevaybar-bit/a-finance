---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
license: MIT
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## When to Use This Skill

**Trigger conditions:**
- User asks: "review my UI", "check accessibility", "audit design"
- User says: "review UX", "check my site against best practices"
- User wants to validate UI code against guidelines

## How It Works

### 1. Fetch Latest Guidelines

Fetch the latest guidelines before each review:

```
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

Use WebFetch to retrieve the latest rules. The fetched content contains all the rules and output format instructions.

### 2. Read Target Files

Read the specified files (or prompt user for files/pattern).

### 3. Check Against Rules

Apply all rules from the fetched guidelines:
- Accessibility compliance
- Design best practices
- UX standards
- Performance guidelines

### 4. Output Findings

Output findings in the format specified in the guidelines (typically `file:line` format).

## Usage

### With File Arguments

When a user provides a file or pattern:
1. Fetch guidelines from source URL
2. Read the specified files
3. Apply all rules
4. Output findings

### Without File Arguments

If no files specified, ask the user which files to review.

## Guidelines Categories

Typical guideline categories include:
- **Accessibility** - ARIA, keyboard navigation, color contrast
- **Performance** - Load times, optimization
- **Design** - Spacing, typography, visual hierarchy
- **UX** - User flow, feedback, error handling
- **Code Quality** - Semantic HTML, valid markup