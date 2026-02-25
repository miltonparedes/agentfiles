---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# TypeScript Conventions

- Enable strict mode in tsconfig.json; never disable strict checks
- Avoid `any`; use `unknown` when the type is truly unknown, then narrow
- Prefer `interface` over `type` for object shapes (interfaces are extensible and produce better error messages)
- Use `type` for unions, intersections, and mapped types
- Prefer `const` assertions and literal types over enums
- Use explicit return types on exported functions
- Prefer `readonly` properties and `ReadonlyArray` when mutation isn't needed
- Handle errors with discriminated unions (`{ ok: true; data: T } | { ok: false; error: E }`) over thrown exceptions for expected failures
- Use `satisfies` operator to validate types without widening
- Prefer `Map`/`Set` over plain objects for dynamic key collections
- Avoid barrel files (`index.ts` re-exports) in large projects; they hurt tree-shaking
