# Condition-Based Waiting

Replace arbitrary timeouts with condition polling.

## The Problem

Arbitrary timeouts (e.g., `sleep(5000)`) are:
- Too short → flaky tests
- Too long → slow execution

## The Solution

Poll for condition instead of waiting:

```javascript
// Bad: arbitrary timeout
await sleep(5000);
expect(element).toBeVisible();

// Good: poll for condition
await expect(element).toBeVisible({ timeout: 10000 });
```

## Polling Pattern

```javascript
async function waitFor(condition, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) return true;
    await sleep(100);
  }
  return false;
}
```

## When to Use

- Waiting for DOM elements
- Waiting for API responses
- Waiting for file system changes
- Waiting for process completion

## Key Point

Wait for condition, not time.