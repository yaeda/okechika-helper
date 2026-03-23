# ExecPlan Template

Use this file as the starting point for a new ExecPlan. Copy it to a new file in this directory with a descriptive kebab-case name such as `plans/refactor-search-state.md`.

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` up to date as work proceeds.

## Summary

- What problem is being solved?
- Why is this work needed now?

## Progress

- [ ] Add a timestamped checklist item for the first concrete step
- [ ] Split partially completed work into done and remaining items
- [ ] Update this section at every meaningful stopping point

Example:

- [x] (2026-03-23 12:00 JST) Document the current state and confirm the scope
- [ ] Implement the first milestone

## Scope

- What is included?
- What is explicitly out of scope?

## Context and Orientation

- What files, modules, screens, or storage keys does a new contributor need to know first?
- What assumptions does this plan rely on?

## Risks and Compatibility

- What user-facing behavior could change?
- What persisted settings, stored data, or import/export formats could be affected?
- What migration, fallback, or rollback is needed?

## Approach

- What is the implementation strategy?
- What alternatives were considered and rejected?

## Plan of Work

1. Preparation
2. Implementation
3. Verification
4. Documentation and cleanup

## Surprises & Discoveries

- Observation: What unexpected behavior, constraint, or useful finding appeared?
- Evidence: What command output, screenshot, or code path supports it?

## Decision Log

- Decision: What choice was made?
  Rationale: Why was this the right tradeoff?
  Date/Author: YYYY-MM-DD, name

## Verification

- What commands will be run?
- What manual checks are required?

## Outcomes & Retrospective

- What was completed?
- What remains or was intentionally deferred?
- What should the next contributor know?

## Docs to Update

- `docs/SPEC.md`
- `docs/USER_GUIDE.md`
- Other docs, if needed
