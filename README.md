# cursor-custom

English | [日本語](README.ja.md)

**Puts AI on the right and your files on the left in Cursor.**

cursor-custom moves AI extensions such as Claude Code and Codex to the right side of Cursor, next to Cursor's own Agent. Both screen edges get a vertical icon bar: the left one switches between files, search and the like, and the right one switches between AIs (similar to Google's Antigravity).

![Files and other views on the left edge, AI on the right, and an icon bar for switching AIs on the right edge](docs/screenshot.png)

## Features

- **Switch AIs from the right edge.** Switch between Cursor Agent and the extensions listed below. The icons stay on the right edge even when the right side bar is closed, and clicking one opens the side bar with that AI.
- **Agent chats as tabs.** Agent chats appear as tabs at the top of the right side bar. Right-click a tab to rename or close the chat. The right edge has a single Agent icon that opens the chat you used last, or starts a new one if there is none.
- **Customize button at the bottom of the right edge.** Opens Cursor's Customize page for rules, skills, MCP servers and more.
- **Account on the right edge.** When you are signed in to Cursor, your account icon appears near the bottom. Hover over it to see your name and plan; click it to open Cursor Settings.
- **Works with Cursor's Agent layout.** In the Agent layout the AI side bar is on the left, so the icon bar moves to the left edge. Cursor keeps the layout you used last (Agent or Editor) across restarts.
- **Vertical icons on the left edge too.** The icons for files, search, Git and so on run down the left edge instead of across the top of the side bar.
- **Turn each side on or off.** A setting per side brings back Cursor's original look on that side ([how](#turn-the-icon-bars-on-or-off)).
- **Reorder the icons.** Drag and drop the icons. The order is kept across restarts.
- **Undo at any time.** Return Cursor to how it was before.

Extensions that move to the right side:

| Extension | Notes |
| --- | --- |
| Claude Code | |
| Codex | |
| Antigravity | |
| Kimi Code | |
| Cody | |
| Windsurf | Not in Cursor's extension marketplace. See [below](#use-windsurf) |

Extensions you have not installed are simply not shown, so you do not need all of them. Even with none of them installed, the right edge shows the Cursor Agent icon.

## Requirements

- Windows (macOS and Linux are not supported)
- Cursor (tested with version 3.24.12)

## Installation

### 1. Download

Click the green **Code** button on this page, choose **Download ZIP**, and extract it anywhere. If you use git, you can clone the repository instead:

```powershell
git clone https://github.com/takemikochan/cursor-custom.git
```

### 2. Close Cursor

Close all Cursor windows. The installer stops if Cursor is still open.

### 3. Install

Double-click **`install.cmd`** in the extracted folder. When the console window shows `done.`, installation is finished. Press any key to close the window.

### 4. Start Cursor

The vertical icon bar appears on the right edge.

## Uninstallation

Close Cursor, then double-click **`uninstall.cmd`**.

Cursor returns to how it was before installation, including its layout.

## Troubleshooting and tips

### Turn the icon bars on or off

Each side has a Cursor setting. Turning a side off brings back Cursor's original look on that side.

| Side | Setting | On (icon bar) | Off (Cursor's original look) |
| --- | --- | --- | --- |
| Right edge (AI) | `workbench.secondarySideBar.showLabels` | `false` | `true` |
| Left edge (files and other views) | `workbench.activityBar.orientation` | `vertical` | `horizontal` |

To change a side:

1. Change the setting. Press `Ctrl+Shift+P`, run `Preferences: Open Settings (UI)`, and search for the setting name. The settings page that `Ctrl+,` opens is Cursor's own and does not list these settings. You can also edit `settings.json` directly.
2. Restart Cursor (close all windows, then start it again). Both sides then follow the settings.

Until you restart, the right side looks half-changed. If you turned it off, the icon bar disappears and text tabs appear at the top of the right side bar. After the restart, Cursor shows the look the setting asks for.

The first run of `install.cmd` turns both sides on. If you have already set either setting yourself, your value is kept.

### Cursor went back to normal after an update

Each Cursor update replaces Cursor's own files, which removes the changes. Close Cursor and run `install.cmd` again.

### An extension installed later shows a placeholder icon

Close Cursor and run `install.cmd` again. Icons are read from each extension when you install cursor-custom.

### "Cursor installation not found"

If Cursor is installed in a non-standard location, the installer cannot find it. Run the installer from PowerShell and pass the folder that contains `Cursor.exe`:

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 -CursorPath "D:\Program Files\cursor"
```

### "Cursor is running"

Cursor is still open. Close all Cursor windows and run the installer again. You also get this message if you run the installer from a terminal inside Cursor.

### Use Windsurf

Windsurf cannot be installed from Cursor's extension marketplace. Install it as follows:

1. Download the VSIX file from [Windsurf on Open VSX](https://open-vsx.org/extension/Codeium/codeium).
2. In Cursor, press `Ctrl+Shift+P`, choose `Extensions: Install from VSIX...`, and select the downloaded file.
3. Close Cursor and run `install.cmd` again.

### Does GitHub Copilot work?

No. Copilot Chat runs inside the chat view built into VS Code, and Cursor does not have that view.

## Things to know

- **The right side bar may open and close briefly right after startup.** If Cursor starts with the right side bar closed, cursor-custom opens it once to create the icons on the right edge.
- **Cursor's layout changes.** When the right icon bar is turned on, cursor-custom switches Cursor to the Editor layout once. You can switch to the Agent layout yourself afterwards. Turning the right side off, or uninstalling, restores your original layout.
- **cursor-custom modifies Cursor's own files.** This is not an official Cursor feature, and the look may break with other Cursor versions.
- **Cursor does not warn that its installation is corrupt.** cursor-custom updates the checksum Cursor uses for the file it modifies.

<details>
<summary>What gets changed</summary>

`uninstall.cmd` reverts all of the following.

| Location | Change |
| --- | --- |
| Cursor's `workbench.html` | Adds one line that loads the CSS for the look and the script for the icon bar's behavior. The two files (`cursor-custom.css` and `cursor-custom.js`) are placed in the same folder |
| Cursor's `package.json` | Points Cursor's entry file (`"main"`) at `out/cursor-custom-main.js`, which arranges the right side according to the setting and then loads Cursor's own entry file |
| Cursor's `out` folder | At startup, writes only your account's display name, picture URL and plan to `cursor-custom-account.json` for the account icon. Your e-mail address and sign-in data are never written |
| Cursor's `product.json` | Updates the checksum for the modified `workbench.html` |
| Your keyboard shortcuts (`keybindings.json`) | Binds `Ctrl+Shift+Alt+F12` to "Open Customize" for the Customize button. The line ends with a `// cursor-custom` marker |
| Your settings (`settings.json`) | Adds `"workbench.secondarySideBar.showLabels": false` and `"workbench.activityBar.orientation": "vertical"`. Each line ends with a `// cursor-custom` marker. Settings you have already set are left untouched |
| Cursor's UI state (`state.vscdb`) | Updated at startup and by `install.cmd` to match the right-side setting. When the right side is on: switches to the Editor layout, turns off Cursor's "Open Chat as Editor Tabs", and moves the AI extensions to the right side bar. When it is off: restores your layout and view placement from before |

</details>

## For developers

- Look: [src/secondary-activitybar.css](src/secondary-activitybar.css)
- Behavior (icon bar placement, chat tabs, buttons, drag and drop): [src/secondary-activitybar.js](src/secondary-activitybar.js)
- Installer: [scripts/cursor-custom.js](scripts/cursor-custom.js)
- Arranging the right side (also runs at startup): [scripts/state.cjs](scripts/state.cjs). The extensions to move are listed in `MOVED_VIEWS` in this file.

## License

[MIT License](LICENSE)
