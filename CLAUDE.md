# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## general coding guidelines

1. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

State your assumptions explicitly. If uncertain, ask.
If multiple interpretations exist, present them - don't pick silently.
If a simpler approach exists, say so. Push back when warranted.
If something is unclear, stop. Name what's confusing. Ask.

2. Simplicity First
Minimum code that solves the problem. Nothing speculative.

No features beyond what was asked.
No abstractions for single-use code.
No "flexibility" or "configurability" that wasn't requested.
No error handling for impossible scenarios.
If you write 200 lines and it could be 50, rewrite it.
Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

3. Surgical Changes
Touch only what you must. Clean up only your own mess.

When editing existing code:

Don't "improve" adjacent code, comments, or formatting.
Don't refactor things that aren't broken.
Match existing style, even if you'd do it differently.
If you notice unrelated dead code, mention it - don't delete it.
When your changes create orphans:

Remove imports/variables/functions that YOUR changes made unused.
Don't remove pre-existing dead code unless asked.
The test: Every changed line should trace directly to the user's request.

4. Goal-Driven Execution
Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

"Add validation" → "Write tests for invalid inputs, then make them pass"
"Fix the bug" → "Write a test that reproduces it, then make it pass"
"Refactor X" → "Ensure tests pass before and after"
For multi-step tasks, state a brief plan:

1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.


## Project Overview

This is **Stumblespace** — an Obsidian community plugin that renders a navigational spatial view of Folgezettel-organized notes. It displays the current note at center with ancestors/siblings/children on a violet spine and semantic references on an amber arc-halo, with direction encoding (outgoing/incoming/mutual).

The project has two artifacts:
- `implementation-plan.md` — the full implementation contract (milestones M0–M5, architecture, types, submission checklist)
- `option-H-show-all-toggle.html` — the working browser prototype that IS the visual/interaction spec

**When in doubt about layout or interaction, the prototype wins. When in doubt about Obsidian compliance, the policy URLs in the plan win.**

## Working Principles

- When in doubt, go back to plan mode and clarify. Never assume.
- No complicated ivory tower code: concise, clean and simple wins.

## Pre-commit Checklist

Before every commit, review the changes against these questions:
1. **Simplify:** Can any of this code be made more concise, simpler, or cleaner? Refactor before committing.
2. **Tests:** Do these changes need automated tests? Pure logic (graph/*, layout.ts) should have tests. Write them before committing.

## Build & Development

This will be an Obsidian plugin using the standard template:
```bash
npm install
npm run dev      # watch mode
npm run build    # production build → main.js + manifest.json at repo root
```

ESLint with `eslint-plugin-obsidianmd` is mandatory — it catches community-plugin review blockers automatically.

## Architecture

Vanilla TypeScript, no frameworks. Renders into an `ItemView`.

```
src/
  main.ts           # Plugin entry
  view.ts           # ZettelCanvasView extends ItemView
  layout.ts         # Pure: (graph, currentId, settings) → positions
  render.ts         # DOM placement & SVG edges
  graph/
    folgezettel.ts  # ID parsing, tree traversal (pure, no DOM)
    index.ts        # VaultIndex: id↔file map + wikilink scanning
    semantics.ts    # Reference detection with direction + folgezettel exclusion
  ui/
    focusCard.ts    # MarkdownRenderer integration
    keyboard.ts     # Keyboard nav (on containerEl, never document)
    splash.ts       # Empty-state
    ghost.ts        # Missing-target stub creation
  settings/
    tab.ts          # PluginSettingTab
    schema.ts       # Settings type + defaults
```

**Key layering rule:** `layout.ts` and `graph/*` are pure — no DOM, no Obsidian imports. They take and return plain data. This keeps them unit-testable.

## Critical Obsidian Compliance Rules

These cause auto-rejection at community plugin review:
- **No `innerHTML`** — use `el.createDiv()`, `el.createEl()`, `document.createElementNS()` for SVG
- **No raw `.on()` event handlers** — always `this.registerEvent()` or `this.registerDomEvent()`
- **No `document.addEventListener`** — attach to `this.containerEl` only
- **No default hotkeys** — users assign their own
- **Command IDs:** no plugin-id prefix, no word "command"
- **All UI text in sentence case**
- **All file paths through `normalizePath()`**
- **Type guards:** `instanceof TFile` / `instanceof TFolder`, no casts
- `manifest.id` must NOT contain "obsidian"; `manifest.name` is sentence case, no "Plugin" suffix

## Core Domain Concepts

- **Folgezettel ID:** derived from filename prefix (e.g. `1.1a3 Title.md` → ID `1.1a3`). Format: number + dot + alternating number-letter segments (e.g. `1.1a`, `2.1b2`, `1.1a3b1`). No `id:` frontmatter field.
- **Spine:** ancestors (max 2 shown), siblings, children, grandchildren (only if ≤2 children). Violet edges.
- **Halo:** semantic references on arc `[195°,265°] ∪ [275°,345°]` with 10° dead zone at 270°. Grouped left→right: outgoing → mutual → incoming.
- **Reference exclusion:** a wikilink becomes a halo reference ONLY if target is not an ancestor/descendant/sibling/self of current AND not in `sources:` frontmatter.
- **`effectiveSemantics()`** applies the "show incoming + mutual" toggle centrally — both layout and edges call it.

## Milestones

Build in order M0→M5. Each has acceptance criteria in `implementation-plan.md` §5. Don't advance until they pass.

M0: Skeleton plugin | M1: Folgezettel parsing & VaultIndex | M2: Port canvas render | M3: Live data wiring | M4: Focus card with MarkdownRenderer | M5: Settings tab
