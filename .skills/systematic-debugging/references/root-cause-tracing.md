# Root Cause Tracing

Trace bugs backward through call stack to find original trigger.

## The Problem

When error manifests deep in call stack, you need to trace backward to find where things went wrong.

## Technique

### Step 1: Identify Bad Value

Find where the error manifests - the symptom location.

### Step 2: Ask "Where did this value come from?"

- What function called this?
- What arguments were passed?
- Are the arguments correct?

### Step 3: Repeat

Keep tracing up the call stack until you find:
- A function producing wrong output
- A boundary where external data enters
- A state mutation that shouldn't happen

### Step 4: Fix at Source

Fix the root cause, not the symptom.

## Example

```
Error: Cannot read property 'name' of undefined
  at UserProfile.render (UserProfile.js:45)
  at ...
```

Trace backward:
1. `UserProfile.js:45` - trying to read `user.name`
2. Where did `user` come from? - `this.props.user`
3. Where did `props.user` come from? - parent component
4. Parent gets user from API - API returns null sometimes
5. Root cause: API handling of missing user

Fix at source (API), not at render.

## Key Question

"Where does the bad value originate?"