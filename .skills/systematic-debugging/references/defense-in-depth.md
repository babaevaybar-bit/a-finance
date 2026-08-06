# Defense in Depth

Add validation at multiple layers after finding root cause.

## Principle

Single point of validation fails. Add checks at multiple layers.

## Layers

1. **Input boundary** - First entry point
2. **Processing** - Transform/shape data
3. **Output** - Before returning
4. **Storage** - Before saving
5. **Display** - UI rendering

## When to Use

After finding root cause, add validation at:
- The source (fix root cause)
- Additional layers (guard against future changes)

## Example

```
Root cause: API returns null for missing user

Defense in depth:
1. API layer - Handle null, return empty object
2. Service layer - Validate before processing  
3. Component - Show fallback if no user
4. Type system - Make user optional in types
```

## Key Point

Fix root cause, then add guards at other layers.