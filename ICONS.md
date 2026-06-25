# FolderMark Icons

This extension requires three icon files:

- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

## Quick Icon Creation

### Option 1: Use Online Icon Generator

1. Go to https://favicon.io/favicon-generator/
2. Type "FM" or "📁" as the icon
3. Download and rename to `icon16.png`, `icon48.png`, `icon128.png`
4. Place in `icons/` folder

### Option 2: Use Chrome Extension Icon Generator

1. Go to https://www.chromeicon.com/
2. Generate icons for Chrome extension
3. Download and place in `icons/` folder

### Option 3: Create Simple Placeholder Icons

For testing purposes, you can create simple solid-color PNG files:

#### Windows PowerShell Script

```powershell
# Create simple placeholder icons (requires ImageMagick or similar)
# Or manually create 3 PNG files with any image editor
```

#### Manual Creation

1. Open Paint or any image editor
2. Create new image with size 128x128
3. Draw a simple folder icon or text "FM"
4. Save as `icon128.png`
5. Resize to 48x48 and save as `icon48.png`
6. Resize to 16x16 and save as `icon16.png`
7. Place all in `icons/` folder

### Option 4: Download Pre-made Icons

You can download free bookmark folder icons from:
- https://www.flaticon.com/
- https://icons8.com/
- https://material.io/resources/icons

Search for: "bookmark folder", "organize", "folder"

## Icon Design Suggestions

- Use a folder icon 📁
- Or use "FM" text (FolderMark)
- Color: Blue (#3B82F6) or consistent with your theme
- Simple and recognizable at small sizes

## Temporary Solution

If you don't have icons yet, the extension will still work but will show default Chrome extension icon.

To remove icon references temporarily, edit `manifest.json` and remove:

```json
"icons": {
  "16": "icons/icon16.png",
  "48": "icons/icon48.png",
  "128": "icons/icon128.png"
}
```

And remove `default_icon` from `action`:

```json
"action": {
  "default_popup": "popup/popup.html"
}
```
