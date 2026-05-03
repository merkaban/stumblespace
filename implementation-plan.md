# Zettelkasten Spatial Canvas — Obsidian Plugin Implementation Plan

**Audience:** A Claude instance picking this up cold to build the plugin.
**Companion artifact:** `option-H-show-all-toggle.html` — the working browser prototype attached to your session. It locks the visual + interaction language. Treat its layout math, render diff, keyboard nav, and direction-aware rendering as the *spec*. This document tells you how to port it into Obsidian without rewriting it.

**Required reading before you start coding:**
- https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- https://docs.obsidian.md/Developer+policies
- https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins

These are not optional. The plugin will be auto-rejected at submission for violations of any of them. Section 7 of this plan flags the most-flagged violations specifically; the docs above are the source of truth.

---

## 1. TL;DR

- **Architecture:** Vanilla TypeScript inside an `ItemView`. No React/Svelte/Vue. The prototype is already vanilla; the layout is pure math; community-plugin review pushes back on bundle bloat. Adding a framework adds cost without paying for it.
- **Frontmatter schema:** minimal — a single `sources:` array. Body wikilinks are the source of truth for references; folgezettel relationships are derived from the filename ID prefix.
- **Build six milestones (M0–M5)** in order. Each has acceptance criteria; don't move on until they pass.
- **Biggest portability risk:** the prototype uses `innerHTML` in several places. Community-plugin review will reject every one. Section 7 catalogs them with replacements.
- **Don't try to use Obsidian's Canvas (`.canvas`) API.** This view is a transient navigational projection, not a persistent canvas artifact. Render directly into your own `ItemView` container.

---

## 2. Spec — locked decisions

These are decided. Don't redesign. If you find yourself wanting to change one of these, stop and ask the user.

### 2.1 Folgezettel ID & filename

- Filename format: `<id> <title>.md` — ID, space, title. E.g. `22a3 Why rediscovery matters.md`.
- Two ID formats supported, normalized to arrays:
  - Alternating: `22a3b1` → `["22","a","3","b","1"]`
  - Dotted: `22.1.3.2.1` → `["22","1","3","2","1"]`
- **Filename prefix is the single source of truth for ID.** No `id:` frontmatter field. No `previous:` or `to:` fields for folgezettel relationships.
- Files without a parseable prefix are not Zettels. They're ignored by the canvas.

### 2.2 Spatial language

1. **Current note** at canvas center (50%/50%), violet glow.
2. **Folgezettel ancestors:** vertical spine above current at x=50%, **capped at the 2 nearest**. If there are more than 2, render a short dashed vertical line above the topmost shown ancestor card to signal "more spine continues upward."
3. **Folgezettel siblings:** fan left/right along the current's y-row.
4. **Folgezettel children:** fan at y=68%.
5. **Grandchildren** at y=94%, but only when current has ≤2 children.
6. **References (semantic neighbors)** placed on a single upper-arc halo. Arcs `[195°, 265°]` and `[275°, 345°]` — total 140° angular budget, with a 10° dead zone at 270° to keep the spine column clear.
7. **Reference grouping (directional):** sort by direction, then by ID alphabetically within group. Order along the arc left-to-right: **outgoing → mutual → incoming**. With proportional spacing — group sizes determine arc share. (See `option-H-show-all-toggle.html` §LAYOUT.)
8. **Direction encoding (visual):**
   - **Outgoing** (current → other): amber accent stripe on left edge of card, single arrowhead at neighbor end of edge.
   - **Incoming** (other → current): dashed amber outline around card, no fill, single arrowhead at current end of edge (use SVG `auto-start-reverse` marker).
   - **Mutual** (both): amber gradient fill + solid amber border + soft glow, double-headed arrow on edge.
9. **Sources have NO spatial position.** They live in the focus card.
10. **Folgezettel edges only between spine-role nodes** (current, ancestors, siblings, children, grandchildren). Two halo nodes that happen to share a folgezettel branch must NOT draw a violet edge between them.
11. **Hover** brings node forward in z-index. **Click** recenters with a 500ms cubic-bezier transition. **Back button** restores previous center.

### 2.3 Reference rule (formal)

A wikilink between two notes becomes a halo reference IF AND ONLY IF:

- The target's filename has a folgezettel prefix (it's a Zettel)
- The target is NOT an ancestor of current (any depth)
- The target is NOT a descendant of current (any depth)
- The target is NOT a direct sibling of current
- The target is NOT current itself
- The target is NOT in current's `sources:` frontmatter

References include **both directions**:
- Outgoing: wikilinks in current's body
- Incoming: wikilinks in other Zettels' bodies pointing at current

The folgezettel exclusion uses **static tree relationships**, not "what's currently rendered." A descendant remains excluded from the halo even when not visible (e.g., grandchildren are hidden when current has 3+ children, but they're still folgezettel relatives, not references).

### 2.4 Interactions

- **Click** on any non-current node → recenter on it
- **Cmd/Ctrl+click** on a node → open the underlying file as a regular note in a new tab (`app.workspace.openLinkText(file.path, '', true)`). Use `Keymap.isModEvent(evt)` to detect modifier — handles Mac vs. Win/Linux automatically.
- **Middle-click** on a node → same as Cmd+click
- **"+" button** on current node → open focus card
- **Click `[[wikilink]]`** inside focus card → close card, recenter on target
- **Cmd+click `[[wikilink]]`** inside focus card → default Obsidian behavior (don't preventDefault when modifier is held)
- **Esc / × / click scrim** → close focus card
- **Click sources list entry** in focus card → recenter on source
- **Keyboard navigation (port from prototype):**
  - Arrow keys: move dashed focus ring (geometric nearest-in-direction)
  - Enter: recenter on focus
  - F: open focus card
  - Backspace: back
  - Esc: close focus card / cancel
- Keyboard handler attaches to the view's container with `registerDomEvent` — never to `document` directly. This prevents stealing keys when other panes are focused.

### 2.5 Setting: "Show incoming + mutual references"

- Default: **ON**
- When **OFF**: hide incoming-only references entirely; demote mutual references to plain outgoing (single amber stripe, single arrowhead, no glow). Remaining all-outgoing nodes fan across the full 140° arc.
- Implementation: a single helper `effectiveSemantics(id)` applies the toggle. Both layout and edge rendering call it. The prototype already implements this pattern — port it directly.

### 2.6 Empty / error states

- **No active Zettel** (active file isn't a Zettel, or no file is open): splash with title "No Zettel selected", explanation, and a clickable list of root notes (those with `parseFz(id).length === 1`).
- **Active file lacks Folgezettel ID**: splash with an additional "Add Folgezettel ID to this file" affordance.
- **Ghost references** (wikilink target doesn't exist): render as a dashed-outline node with a "missing" badge on the halo. Click → prompt "Create stub note `<id>`?" that pre-fills filename `<id> .md` in the same folder as current.

---

## 3. Frontmatter schema (the contract)

The schema is intentionally minimal:

```yaml
---
sources:
  - "[[99a Ahrens · How to Take Smart Notes]]"
  - "[[99b Schmidt · Luhmann's archive]]"
---

Body markdown. Wikilinks like [[31b Cognitive cost of search]] and 
[[44c Bush's Memex]] become references on the halo automatically.
```

**Rules:**
- `sources:` is the only frontmatter field the plugin reads. Optional. Empty by default.
- Each source entry is a wikilink in **full basename** form: `[[<id> <title>]]`.
- Body wikilinks (`[[<id> <title>]]`) become references unless the target is in `sources:`. Sources take precedence — a Zettel mentioned in both `sources:` and the body is a source, not a reference.
- No `id:` field. No `links:` array. No `to:`, `previous:`, or any other folgezettel relationship fields. The filename prefix tells you everything.

**Why full basename, not just `[[31b]]`:** with the filename convention `22a3 Why rediscovery matters.md`, a wikilink `[[22a3]]` is unresolved by Obsidian unless aliases are maintained. Full basename resolves natively, follows file renames automatically via Obsidian's link-update machinery, and works with autocomplete.

---

## 4. Architecture

```
src/
  main.ts                  # Plugin entry (extends Plugin)
  view.ts                  # ZettelCanvasView extends ItemView
  layout.ts                # Pure: (graph, currentId, settings) → positions
  render.ts                # DOM placement & SVG edges; consumes positions
  graph/
    folgezettel.ts         # parseFz, fzParent, fzAncestors, fzChildren, fzSiblings
    index.ts               # VaultIndex service: id↔file map + body wikilink scan
    semantics.ts           # semanticNeighbors, effectiveSemantics, isFolgezettelRelative
  ui/
    focusCard.ts           # Focus card + MarkdownRenderer integration
    keyboard.ts            # Keyboard handler (no global hotkeys)
    splash.ts              # Empty-state splash
    ghost.ts               # Ghost-node interaction (stub creation prompt)
  settings/
    tab.ts                 # PluginSettingTab
    schema.ts              # Settings type + defaults
manifest.json
styles.css
README.md
LICENSE
versions.json
.eslintrc.cjs              # uses eslint-plugin-obsidianmd
```

**Layering rule:** `layout.ts` and `graph/*` know nothing about the DOM or Obsidian. They take plain data structures and return plain data structures. This keeps them unit-testable and matches how the prototype is already organized — preserve that discipline.

**State (single source of truth, on the View instance):**
```ts
interface ViewState {
  currentId: string | null;     // canvas-center node
  history: string[];            // back stack, cap at 64
  kbFocus: string | null;       // dashed focus ring (defaults to currentId)
  lastPositions: PositionMap;   // cached for keyboard nav
}
```

**Settings (single source of truth, on the Plugin instance):**
```ts
interface ZSCSettings {
  showIncomingAndMutual: boolean;   // default true
  animationDurationMs: number;      // default 500
  openCanvasOn: 'active-file' | 'last-viewed' | 'empty-splash';  // default 'active-file'
  folgezettelFormat: 'auto' | 'alternating' | 'dotted';          // default 'auto'
}
```

---

## 5. Milestones

Each milestone is independently testable. Don't move on until acceptance criteria pass.

### M0 — Skeleton plugin

**Tasks**
- Clone `obsidianmd/obsidian-sample-plugin` template.
- `manifest.json`: `id: "zettelkasten-spatial-canvas"` (must NOT contain "obsidian"), `name: "Zettelkasten spatial canvas"` (sentence case, no "Plugin" suffix), description, `minAppVersion`, `author`.
- Configure ESLint with `eslint-plugin-obsidianmd`. This catches the most common review-blocker patterns automatically.
- Implement `Plugin.onload`: `registerView`, `addCommand({ id: 'open-canvas', name: 'Open spatial canvas', ... })`. Note: command id has NO plugin-id prefix; command name has NO "command" word.
- `ZettelCanvasView extends ItemView` with `getViewType()`, `getDisplayText()`, `getIcon()` (use a built-in name like `"network"`).
- `onOpen()` writes a placeholder. `onunload` does NOT call `detachLeavesOfType` — that's an explicit footgun.

**Acceptance**
- Loads in dev vault; command opens the view in a new leaf.
- ESLint with the obsidianmd preset passes.
- `npm run build` produces `main.js` and `manifest.json` in repo root.

### M1 — Folgezettel parsing & VaultIndex

**Tasks**
- Port from prototype directly (these are pure, no DOM):
  - `parseFz`, `fzParent`, `fzAncestors`, `fzChildren`, `fzSiblings`
  - `isFolgezettelRelative` (the formal ancestor/descendant/sibling/self check)
  - `semanticNeighbors`, `effectiveSemantics`
- Build `VaultIndex`:
  - `byId: Map<string, TFile>` — keyed by ID, populated by scanning the vault on load
  - Filename parser: regex out `^([0-9]+(?:[a-z]+[0-9]+)*[a-z]?|[0-9]+(?:\.[0-9]+)+)\s` from `file.basename`. The space after the ID is required.
  - `getNote(id)`, `getChildren(id)`, `getAncestors(id)`, `getSiblings(id)`
  - `getReferences(id)`: returns `Array<{id, dir: 'out'|'in'|'mutual'}>`. Builds from `app.metadataCache.resolvedLinks` (forward) and `app.metadataCache.getBacklinksForFile()` (incoming) via `getFileCache(file).links` — never read raw file bodies. Excludes folgezettel relatives, self, and entries in current's `sources:` frontmatter.
- On `Plugin.onload`, register vault subscriptions:
  ```ts
  this.registerEvent(this.app.metadataCache.on('changed', this.handleChanged))
  this.registerEvent(this.app.metadataCache.on('resolved', this.handleResolved))
  this.registerEvent(this.app.vault.on('rename', this.handleRename))
  this.registerEvent(this.app.vault.on('delete', this.handleDelete))
  this.registerEvent(this.app.vault.on('create', this.handleCreate))
  ```
  **Always use `this.registerEvent` — never raw `.on()`** so handlers detach on plugin unload. This is the single most-flagged review issue.
- Debounce rebuilds: 250ms gap to batch sync bursts. Use `requestAnimationFrame` for layout updates.

**Acceptance**
- Console: `app.plugins.plugins['zettelkasten-spatial-canvas'].index.getReferences('22a3')` returns a typed array with correct `dir` values on a real test vault.
- Renaming a Zettel updates the index without restart.
- Deleting a file removes it from `byId`.
- `isFolgezettelRelative('22a3', '22a3a1')` returns true; `isFolgezettelRelative('22a3', '22b')` returns false.

### M2 — Port the canvas

**Goal:** Render the prototype's exact spatial layout, fed by VaultIndex, in an Obsidian view. Port the prototype's render pipeline; do not reinvent.

**Tasks**

Port from the prototype (line numbers approximate against `option-H-show-all-toggle.html`):
- `layout()` function — pure, takes `(currentId, settings)`, returns `Map<id, Position>`. Position includes `{x, y, role, dir?}` where `role ∈ 'current'|'ancestor'|'sibling'|'child'|'grandchild'|'semantic'` and `dir ∈ 'out'|'in'|'mutual'` for semantic only.
- `render()` — DOM placement + animated transitions
- `renderEdges()` — SVG edges with direction-aware markers
- All keyboard navigation logic (arrow keys, F/Enter/Backspace/Esc, geometric nearest-in-direction)

Replace prototype patterns with Obsidian-compliant equivalents (see Section 7 for the full table):
- Every `el.innerHTML = '...'` → `el.createDiv({cls})`, `el.createEl('span', {text, cls})`, etc.
- For SVG `<defs>` and `<marker>` elements, use `document.createElementNS` directly with explicit attribute setters. No Obsidian helper exists for SVG; that's acceptable as long as no untrusted strings touch innerHTML.
- `el.onclick = ...` → `this.registerDomEvent(el, 'click', ...)`
- `addEventListener('keydown', ...)` on `document` → `registerDomEvent` on `this.containerEl`
- `setTimeout` for fade-cleanup → store handle on the view, clear in `onClose`
- Move all static styles to `styles.css`. JS sets only **dynamic** properties: `el.style.left/top/opacity` for positioning and fade. Reviewer rule: don't set styling that themes might want to override.
- Drop hover/focus z-index pokes from JS; handle via `:hover` and `.kb-focus` CSS rules. The prototype already does this — preserve it.
- `prefers-reduced-motion: reduce` removes the recenter transition (CSS media query, not a JS branch on the duration setting).

**No default hotkeys.** Users assign their own. This is a hard review rule.

**Acceptance**
- Opens with a live vault, picks the active file as `currentId` (or shows splash if not a Zettel), renders the same spatial layout the prototype produced.
- Click on any halo or spine node recenters with the 500ms transition.
- All keyboard nav works exactly as in prototype.
- The "show incoming + mutual" setting (M5) toggle, when wired up later, instantly reorganizes the halo and updates edge styles.
- ESLint with `eslint-plugin-obsidianmd` reports zero `innerHTML` violations.
- Reduced-motion users see no transition.

### M3 — Live data wiring

**Tasks**
- Subscribe view to `metadataCache.changed`. On change of any visible file (current, ancestor, sibling, child, neighbor), or on `resolved` events: re-run layout, diff visible-set, animate.
- Throttle re-layouts via `requestAnimationFrame` — one layout per frame max. A vault sync touching 200 files should produce ≤2 visible re-layouts (debounce + RAF combine).
- Empty-state splash (see §2.6).
- Ghost-node creation: clicking a missing-target ghost prompts "Create stub note `<id>`?" → on confirm, create file `<id> .md` in same folder as current via `app.vault.create()`. Use `normalizePath()` on the constructed path.
- `Mod`-click and middle-click handlers on every node: open the underlying file in a new tab via `app.workspace.openLinkText(file.path, '', true)`. Use `Keymap.isModEvent(evt)` for cross-platform modifier detection.
- Focus-card link interception: on click in focus-card body, check `target.matches('a.internal-link')`. If `Keymap.isModEvent(evt)` is true → let the default handler run (opens in new tab). Otherwise → preventDefault, close focus card, recenter on target via VaultIndex resolution.

**Acceptance**
- Edit `22a3.md`'s body to add a new wikilink to `31b1` while the canvas is open on `22a3` — new reference appears on the halo within ~100ms without reopening.
- Rename `22a3 Old title.md` to `22a3 New title.md` — title in card updates, ID stays `22a3`, layout doesn't break.
- Delete a child note — it animates out without an error.
- Open a file with no Folgezettel prefix → empty splash appears.
- Cmd+click on a halo node opens the file in a new tab while leaving the canvas centered where it was.

### M4 — Focus card with real Markdown rendering

**Tasks**
- `ui/focusCard.ts` exports `openFocusCard(view, id)`. Build the card with DOM API only — no `innerHTML` even for the structural template.
- Render body content:
  ```ts
  const file = view.plugin.index.byId.get(id);
  await MarkdownRenderer.render(
    view.app,
    await view.app.vault.cachedRead(file),
    bodyEl,
    file.path,
    view  // pass the VIEW as Component for proper child-component teardown
  );
  ```
- Sources list in card: read `app.metadataCache.getFileCache(file).frontmatter?.sources`, parse each entry as a wikilink, resolve to a TFile, render as a clickable list. Click → recenter (push history, set currentId, rerender).
- Internal-link click handler (see M3 task above): single `registerDomEvent('click', ...)` on the body container.
- Esc / × / scrim click → close. All converge on `closeFocusCard()` which calls `body.empty()` to clear the rendered Markdown's component tree before the card unmounts.

**Acceptance**
- Opens focus card on a note with embedded `[[wikilinks]]`, code fences, math, callouts. All render correctly via Obsidian's pipeline.
- Click `[[wikilink]]` inside focus card → card closes, canvas recenters.
- Cmd+click `[[wikilink]]` inside focus card → opens in new tab; canvas state unchanged.
- Sources list shows `sources:` frontmatter entries, each clickable to recenter.
- Closing via Esc, scrim, or × all leave no leaked DOM and no leaked event listeners.

### M5 — Settings tab

**Tasks**
- `settings/schema.ts` defines `ZSCSettings` and `DEFAULT_SETTINGS`.
- `settings/tab.ts` extends `PluginSettingTab`. Use `new Setting(containerEl)` for each control. Section headings via `.setHeading()` — never raw `<h1>`.
- All UI text in **sentence case**: "Show incoming + mutual references", not "Show Incoming + Mutual References". The eslint plugin catches violations.
- On `Plugin.onload`: `this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())`.
- On any setting change: `await this.saveData(this.settings)`, then notify the view. Simplest pattern: a small EventEmitter on the plugin instance; the view subscribes and calls `queueRender()`.

**Settings (final list — see §4 schema):**
- **Show incoming + mutual references** — toggle, default ON. The toggle from the prototype.
- **Animation duration (ms)** — number input, default 500. Overridden by `prefers-reduced-motion`.
- **Open canvas on** — dropdown: `Active file` / `Last viewed Zettel` / `Empty splash`. Default: `Active file`.
- **Folgezettel format detection** — dropdown: `Auto` / `Alternating only` / `Dotted only`. Default: `Auto`.

**Acceptance**
- All settings round-trip across Obsidian restarts.
- Toggling "show incoming + mutual" instantly reorganizes the halo (incoming nodes vanish, mutuals lose glow, remaining outgoings spread across full arc).
- Reduced-motion users see no transition regardless of the duration setting.

### M6 — A11y, mobile, submission readiness

**Tasks**
- **Accessibility:**
  - Each node `el` gets `role="button"`, `tabindex="0"`, `aria-label="Recenter on ${id} ${title}"`.
  - Canvas container: `role="application"`, `aria-roledescription="Spatial Zettelkasten canvas"`.
  - Focus ring is CSS `outline` (not custom border) so high-contrast mode keeps it.
  - Semantic HTML: `<button>` for chips and toggles, not styled `<div>`.
- **Mobile:**
  - `manifest.json` `isDesktopOnly: false`. Nothing requires desktop.
  - Touch targets ≥ 44px.
  - Don't intercept multi-finger gestures — let Obsidian's pane gestures pass through.
- **Path safety:** `normalizePath()` on every file path you construct (notably stub-note creation in M3).
- **Type guards:** `instanceof TFile` / `instanceof TFolder` instead of type casts.
- README with: what it is, screenshot, frontmatter schema (just `sources:`), filename convention, hotkey advice ("none by default; assign your own"), known limitations, license. All headings sentence case.
- LICENSE file.
- `versions.json` with the version-to-minAppVersion mapping.
- Final ESLint pass with `eslint-plugin-obsidianmd` — zero errors.
- Smoke-test on a 5000-note vault. Layout should be <5ms; full re-render <16ms.

**Acceptance**
- Plugin passes `obsidian-releases` automated bot checks.
- Tab cycles focus through interactive elements properly.
- Works on mobile Obsidian without errors.

---

## 6. ItemView state serialization

```ts
getState(): Record<string, unknown> {
  return { currentId: this.state.currentId };
}
async setState(state: any, result: ViewStateResult): Promise<void> {
  if (state?.currentId) this.state.currentId = state.currentId;
  await super.setState(state, result);
  this.queueRender();
}
```

Without this, splitting the canvas pane or restarting Obsidian dumps you back to the empty splash. With it, two split canvases on the same Zettel stay independent. History (back stack) is **not** persisted — within-session only.

---

## 7. Prototype portability traps

The prototype is HTML/JS. Some patterns will fail Obsidian review. Each line below is a concrete bug if missed.

| Prototype pattern | Issue | Replacement |
|---|---|---|
| `el.innerHTML = '<div class="id">…'` | Reviewer auto-reject | `el.createDiv({cls:'id'})`, `el.createEl('span', {text, cls})`, etc. |
| `defs.innerHTML = '<marker …>'` | Same | `document.createElementNS(NS_SVG, 'marker')` + `setAttribute` for each attr |
| `card.innerHTML = '<button class="fc-close">…'` | Same | Largest single rewrite — full DOM API construction |
| `edgesSvg.innerHTML = ""` (clearing) | Lints flag this | `edgesSvg.empty()` (Obsidian helper) or `while (edgesSvg.firstChild) edgesSvg.firstChild.remove()` |
| `el.style.left/top/opacity` (dynamic) | OK — legitimately dynamic | Keep |
| `el.onclick = ...` | Replaces handlers invisibly; doesn't auto-detach | `this.registerDomEvent(el, 'click', ...)` |
| `document.addEventListener('keydown', ...)` | Steals keys from other panes; doesn't auto-detach | `this.registerDomEvent(this.containerEl, 'keydown', ...)`, only handle when canvas focused |
| `setTimeout(..., 400)` for fade-out | Leaks if view unloads mid-fade | Store handle on view; clear in `onClose` |
| Hardcoded `vault` object | The whole point | Replace with `VaultIndex` from M1 |
| Hardcoded `current = "22a3"` | n/a | Driven by `app.workspace.getActiveFile()` and view state |
| `requestAnimationFrame` for post-create position | OK | Keep |
| Static color/style strings in JS | Review flag for theme override | Move to `styles.css`; use Obsidian CSS variables (`--background-primary`, etc.) where a theme-following surface fits |

**Subtle gotcha:** the prototype includes a `hashId()` function that's no longer used (replaced by direction-grouped sort). Remove it during port; don't carry dead code.

**Async/await inside event handlers:** `MarkdownRenderer.render()` is async. Wrap call sites and handle errors — never let promise rejections propagate uncaught.

---

## 8. Open question — defer to v2

**Halo overflow at scale.** The prototype's geometry handles up to ~15-20 references comfortably. Beyond that, even with radius staggering, the arc clusters. Don't solve in v1. If users hit this:
- Sort by `backlinkCount desc, id asc` (more central notes prioritized)
- Cap at ~20
- Render a "+N more" pill at the arc's edge that expands an inline floating list

Add only if real users complain. Prototype-level density is fine for v1.

---

## 9. Submission checklist

Run before opening the PR to `obsidianmd/obsidian-releases`:

- [ ] `manifest.json` at repo root AND attached to GitHub release as a binary asset
- [ ] `main.js` attached to GitHub release as a binary asset
- [ ] `styles.css` attached to GitHub release as a binary asset
- [ ] Release tag matches `manifest.version` exactly (no `v` prefix)
- [ ] `manifest.id` does not contain "obsidian"
- [ ] `manifest.name` is sentence case, no "Plugin" suffix
- [ ] No `innerHTML`, `outerHTML`, or `Function()` constructor in `main.js`
- [ ] All event handlers use `registerEvent` / `registerDomEvent` / `registerInterval`
- [ ] No default hotkeys
- [ ] All command IDs lack the plugin-id prefix and the word "command"
- [ ] All UI text in sentence case
- [ ] All file paths run through `normalizePath()`
- [ ] `instanceof TFile` / `instanceof TFolder` (no type casts)
- [ ] README has purpose, usage, schema, screenshot
- [ ] LICENSE present
- [ ] ESLint with `eslint-plugin-obsidianmd` passes with zero errors

Re-read these before submission:
- https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- https://docs.obsidian.md/Developer+policies
- https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins

---

## 10. Quick reference — types

```ts
// graph/folgezettel.ts
export function parseFz(id: string): string[];
export function fzParent(id: string): string | null;
export function fzAncestors(id: string, allIds: Set<string>): string[];     // nearest-first
export function fzChildren(id: string, allIds: Set<string>): string[];
export function fzSiblings(id: string, allIds: Set<string>): string[];

// graph/semantics.ts
export type Dir = 'out' | 'in' | 'mutual';
export interface Reference { id: string; dir: Dir; }
export function isFolgezettelRelative(currentId: string, otherId: string): boolean;
export function semanticNeighbors(id: string, index: VaultIndex): Reference[];
export function effectiveSemantics(id: string, index: VaultIndex, settings: ZSCSettings): Reference[];

// graph/index.ts
export class VaultIndex {
  byId: Map<string, TFile>;
  getNote(id: string): TFile | undefined;
  getChildren(id: string): string[];
  getAncestors(id: string): string[];
  getSiblings(id: string): string[];
  getReferences(id: string): Reference[];
  getSources(id: string): string[];      // resolved IDs from sources: frontmatter
}

// layout.ts
export type Role = 'current' | 'ancestor' | 'sibling' | 'child' | 'grandchild' | 'semantic';
export interface Position { x: number; y: number; role: Role; dir?: Dir; }
export type PositionMap = Map<string, Position>;
export function layout(
  index: VaultIndex,
  currentId: string,
  settings: ZSCSettings
): PositionMap;

// view.ts
export class ZettelCanvasView extends ItemView {
  static VIEW_TYPE = 'zettelkasten-spatial-canvas';
  getViewType() { return ZettelCanvasView.VIEW_TYPE; }
  getDisplayText() { return 'Spatial canvas'; }
  getIcon() { return 'network'; }
  // state, lifecycle, getState/setState, queueRender, recenter(id), goBack()
}
```

---

## 11. What this plan deliberately defers to v2

To keep v1 shippable, these are explicitly out of scope. Don't let them creep in:

- Editing frontmatter (`sources:`) through plugin UI — users edit the file
- A separate "graph view" without a center
- LaTeX/math/embed rendering beyond what `MarkdownRenderer.render()` handles
- Cross-vault linking
- Custom canvas themes — only respect Obsidian's dark/light setting
- Animated arc-redraw when the show-all toggle flips (instant is fine)
- Halo overflow handling (see §8)
- Re-typing connections (e.g. "this should be 'supports' not just 'see-also'") — the schema stays untyped

---

*End of plan. The companion file `option-H-show-all-toggle.html` is the visual + interaction spec; this document is the implementation contract. When in doubt about layout or interaction, the prototype wins. When in doubt about an Obsidian compliance question, the three policy URLs at the top win.*
