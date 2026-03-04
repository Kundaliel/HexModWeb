# Hex Craft Web Viewer

## Installation

### Download ZIP
1. Download the repository as a ZIP file
2. Extract the ZIP file to your desired location
3. Open `index.html` in your web browser

### Clone Repository
```bash
git clone https://github.com/Kundaliel/HexModWeb.git
cd HexModWeb
```
Then open `index.html` in your web browser.

---

## Features

### Drawing Mode (Default)
Draw hex patterns interactively on the canvas by clicking and dragging across the hex grid. The grid snaps to valid hex positions and highlights the hex under your cursor. Patterns are color-coded and display directional arrows, with a larger arrow marking the start of each pattern.

Hovering over a placed pattern highlights it with a glow and shows its name and signature in a tooltip.

### Autocomplete Pattern Search (`Ctrl/Cmd + Space`)
Opens a searchable panel listing all known Hex Casting patterns. Type to filter by name or angle signature. The selected entry shows a live mini-canvas preview of the pattern.

- **Typing a number** (e.g. `42`, `-7`, `0.5`) generates the correct `Numerical Reflection` encoding automatically, including multi-pattern decomposition for large or fractional numbers.
- Arrow keys or scroll wheel navigate the list; `Enter` or `Tab` commits the selection.

After selecting a pattern, it enters **placing mode** — a ghost of the pattern follows your cursor. If the position is blocked, a nudge suggestion is shown in gray at the nearest free position.

- **`R`** — rotate clockwise
- **`E`** — rotate counter-clockwise
- **Left click** — place the pattern (auto-nudges if blocked)
- **Right click / Escape** — cancel

### Viewing Mode (URL-based)
View a specific pattern by adding a URL hash:
- `index.html#qaq` — shows pattern with default north direction
- `index.html#west-qaq` — shows pattern with specified direction

Supported directions: `north`, `south`, `east`, `west`, `northeast`, `northwest`, `southeast`, `southwest`

In viewing mode the pattern is displayed enlarged and centered, with an info bar showing the pattern name, direction, and angle signature. Drawing and keybinds are disabled.

**Examples:**
- `index.html#qaq` — Mind's Reflection (north)
- `index.html#west-qaq` — Mind's Reflection (west)
- `index.html#northeast-wawawddew` — Gravitational Purification (northeast)

---

## Keybinds

| Action | Shortcut |
|---|---|
| Draw pattern | Left click + drag |
| Undo last pattern | `Ctrl/Cmd + Z` |
| Open autocomplete | `Ctrl/Cmd + Space` |
| Save as image | `Ctrl/Cmd + S` |
| Export pattern data | `Ctrl/Cmd + Shift + S` |
| Cancel drawing / placing | `Escape` |
| Clear all patterns | `Shift + Right-click` |
| Show shortcuts | `/` |
| **Placing mode** | |
| Rotate clockwise | `R` |
| Rotate counter-clockwise | `E` |
| Place pattern | Left click |
| Cancel placing | `Escape` or Right click |

*Keybinds are disabled in viewing mode.*
