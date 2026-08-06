---
name: interactive-prototype-planner
description: Plans interactive HTML or React prototypes with component structure, states, flows, and user interactions. Use when user wants to create interactive prototypes, web artifacts, or design component trees and state flows before coding.
license: MIT
---

# Interactive Prototype / Web Artifact Planner

Plans interactive HTML or React prototypes with component structure, states, flows, and user interactions.

## When to Use This Skill

**Trigger conditions:**
- User wants to create an interactive prototype
- User mentions: prototype, web artifact, interactive UI, component tree
- User wants to design: filters, lists, modals, onboarding, dashboards
- User says: "plan a web app", "design prototype structure", "component flow"

## Core Features

- Turns product requirements into prototype structure
- Defines component trees, states, and interaction flows
- Supports: filters, lists, modals, onboarding, dashboards, settings, multi-step workflows
- Works as a planning layer before actual code generation

## Workflow

### Step 1: Analyze Product Flow

Understand:
- Key user tasks and goals
- Entry points and user journeys
- Data requirements and assumptions

### Step 2: Define Structure

Create:
- **Screens/Pages** - Main views and navigation
- **Component Tree** - Hierarchy of reusable components
- **States** - Component states (loading, empty, error, success)
- **Interactions** - User actions and system responses

### Step 3: Generate Prototype Plan

Output format:
```markdown
# Prototype Plan: [Project Name]

## Overview
[Product description and goals]

## Screens
1. [Screen Name]
   - Purpose: [What user does here]
   - Components: [List of components]
   - States: [Loading, empty, error, etc.]

## Component Tree
```
App
├── Header
│   ├── Logo
│   └── Navigation
├── Main Content
│   ├── FilterBar
│   ├── ResultList
│   │   └── ResultCard
│   └── DetailModal
└── Footer
```

## Interactions
| User Action | System Response | State Change |
|-------------|----------------|--------------|
| Click filter | Update results | Loading → Results |
| Click item | Open modal | List → Modal |

## Data Assumptions
- [Assumption 1]
- [Assumption 2]
```

## Supported Patterns

### Filters + List + Detail
- Filter sidebar with categories
- Result list with cards
- Detail modal on click

### Onboarding Flow
- Multi-step welcome screens
- Progress indicator
- Skip/continue options

### Dashboard
- Summary cards with metrics
- Charts and visualizations
- Quick actions

### Settings
- Form sections
- Toggle switches
- Save/cancel actions

## Implementation Notes

- Plan is implementation-friendly
- Components can be built with React, Vue, or plain HTML
- States guide error handling and loading UX
- Interactions define event handlers

## Example Prompts

- "Create an interactive prototype for an AI travel planner"
- "Design a web app with filters, result list, favorites, and detail modal"
- "Plan pages, component trees, and state flows for a booking admin console"

## Stack (for actual implementation)

- React 18 + TypeScript
- Tailwind CSS + shadcn/ui
- Vite + Parcel (bundling)
- Single HTML artifact output

**Read:** `references/web-artifacts-builder.md` for implementation details