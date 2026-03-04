# AGENTS.md

This document is a guide for agents and contributors working in this repository.

## 1. Project Overview

- Tech stack: WXT / React / TypeScript / Tailwind CSS
- Domain: A toolset for playing [桶地下 / OKECHIKA](https://www.daiyonkyokai.net/bps/guide/78fghuvtgy7/)
- Current primary target: Browser extension

## 2. Specification Management

- The single source of truth (SSOT) for product specifications is `docs/SPEC.md`
- Any implementation change that affects behavior or UX must update `docs/SPEC.md` in the same change
- Divergence between implementation and `docs/SPEC.md` is not allowed

## 3. Coding Guidelines

- Prefer functional, composable component design
- Keep side effects at boundaries (e.g., storage, navigation, keyboard handlers)
- Prioritize type safety
- Avoid `any` in principle
- Use `import type` for type-only imports
- Respect the existing path alias (`@/*` -> `src/*`)

## 4. Tooling / Quality Gates

- ESLint is the standard linter
- Prettier is the standard formatter
- Formatting output is authoritative
- Tailwind class ordering should be handled by formatter tooling once configured
- Commits or merges with lint/format violations are not allowed after tooling is enabled in CI/scripts
- If lint/format/test tooling is introduced or changed, update this file and `docs/SPEC.md` as needed

## 5. Development Flow

- Principle: one PR, one purpose
- If a change requires spec updates, include them in the same PR as the implementation
- Do not mix unrelated refactors with feature/fix work

## 6. Commit Messages

- Follow Conventional Commits
- Format: `<type>(<scope>): <subject>`

## 7. Maintenance

- Keep dependencies reasonably up to date
- Revisit and update this document as project conventions evolve
