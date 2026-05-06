# Stumblespace

A spatial canvas for Folgezettel-organized notes in [Obsidian](https://obsidian.md).

The current note sits at the centre. Folgezettel ancestors, siblings, and children fan out on a violet spine. Semantic references (wikilinks to and from notes that are not Folgezettel relatives) live on an upper-arc halo, with direction (outgoing, incoming, mutual) encoded in colour and shape. Click any node to recenter; press **F** or click the **+** to open the focus card and read the note in place.

## Filename convention

Stumblespace derives all Folgezettel relationships from the filename prefix. Format:

```
<id> <title>.md
```

The ID is a number, a dot, then alternating number/letter segments. Examples:

| Filename | ID |
| --- | --- |
| `1.1 Memex.md` | `1.1` |
| `1.1a Bush's vision.md` | `1.1a` |
| `1.1a3 Why rediscovery matters.md` | `1.1a3` |
| `2.1b2 Adler on inspectional reading.md` | `2.1b2` |

The ID and title are separated by a single space. Notes without a parseable prefix are ignored by the canvas — you can edit them as normal Obsidian notes, just outside Stumblespace's view.

## Frontmatter schema

The plugin reads exactly one optional field:

```yaml
---
sources:
  - "[[99a Ahrens · How to take smart notes]]"
  - "[[99b Schmidt · Luhmann's archive]]"
---

Body markdown. Wikilinks like [[31b Cognitive cost of search]]
become halo references automatically.
```

- `sources:` — an array of full-basename wikilinks. Sources appear in the focus card, not on the canvas. A wikilink that is in `sources:` is excluded from the halo.
- No `id:` field. No `previous:` / `to:` fields. Filename prefix is the only source of truth for Folgezettel relationships.

## Halo references

Body wikilinks become halo references when:

- The target's filename has a Folgezettel prefix
- The target is **not** an ancestor, descendant, or direct sibling of the current note
- The target is **not** the current note itself
- The target is **not** in the current note's `sources:` frontmatter

References include both directions: outgoing wikilinks in the current note's body, and incoming wikilinks from other notes that point at the current note.

A wikilink whose target file does not yet exist appears as a dashed-outline "ghost" node. Click it to create the stub note immediately, using the wikilink's title as the file name.

## Hotkeys

Stumblespace ships with **no default hotkeys**. Assign your own under **Settings → Hotkeys** for the command **Open spatial canvas**. Inside the canvas, the following keyboard shortcuts are always active:

- **Arrow keys** — move the dashed focus ring (geometric nearest-in-direction)
- **Enter** — recenter on the focused node
- **F** — open the focus card for the current note
- **Backspace** — go back to the previously-centered note
- **Esc** — close the focus card
- **Cmd/Ctrl + click** or **middle-click** any node — open the underlying file in a new tab

## Settings

- **Show incoming + mutual references** — when off, only outgoing references appear on the halo. Mutual references collapse to plain outgoing.
- **Animation duration (ms)** — transition time when recentering. Overridden by the system reduce-motion preference.
- **Open canvas on** — which note the canvas centers on when opened: the active file, the last viewed Zettel (persisted), or always start with an empty splash.

## Limitations

- Folgezettel ID format is **dotted** (`<num>.<num>...`); pure-alternating IDs like `22a3` are not supported.
- Halo reference layout is comfortable up to roughly 15–20 references per note. Beyond that the arc gets crowded; we do not currently page or summarise.
- Stumblespace is desktop-only. The canvas is geometry-heavy and not suited to phone-sized screens.

## License

[MIT](LICENSE)
