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

## Features

### Drawing Mode (Default)
Draw hex patterns interactively on the canvas.

### Viewing Mode (URL-based)
View a specific pattern by adding a URL hash in the format:
- `index.html#qaq` - Shows pattern with default "north" direction
- `index.html#west-qaq` - Shows pattern with specified direction

Supported directions: `north`, `south`, `east`, `west`, `northeast`, `northwest`, `southeast`, `southwest`

In viewing mode:
- Pattern is displayed enlarged and centered
- An info bar shows Pattern Name, Direction, and Pattern Code
- Drawing and keyboard shortcuts are disabled

**Examples:**
- `index.html#qaq` - Mind's Reflection (north)
- `index.html#west-qaq` - Mind's Reflection (west)
- `index.html#northeast-wawawddew` - Gravitational Purification (northeast)

## Keybinds

- **Left Click + Drag** - Draw hex patterns
- **Ctrl + S** (or **Cmd + S**) - Save as image
- **Ctrl + Shift + S** (or **Cmd + Shift + S**) - Export pattern data
- **Escape** - Cancel current drawing

*Note: Keybinds are disabled in viewing mode*
