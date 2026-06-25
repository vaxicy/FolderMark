# FolderMark Installation Guide

## Quick Start

### 1. Create Icons (Required)

The extension needs icon files. Quick ways to create them:

#### Method 1: Download Free Icons

1. Go to https://www.flaticon.com/
2. Search: "folder bookmark"
3. Download PNG in 16px, 48px, 128px sizes
4. Rename to `icon16.png`, `icon48.png`, `icon128.png`
5. Put in `icons/` folder

#### Method 2: Create Simple Text Icons

**Using Online Tool:**

1. Go to https://textstudio.com/3d-logo/
2. Type "FM" (FolderMark)
3. Choose blue color (#3B82F6)
4. Download as PNG
5. Resize to 16x16, 48x48, 128x128
6. Save in `icons/` folder

**Using Paint (Windows):**

1. Open Paint
2. Create new file: 128x128 pixels
3. Type "FM" in big font
4. Save as `icon128.png`
5. Resize to 48x48 → save as `icon48.png`
6. Resize to 16x16 → save as `icon16.png`
7. Move to `icons/` folder

#### Method 3: Use Emoji as Icon

1. Take screenshot of 📁 emoji
2. Crop to square
3. Resize to 128x128, 48x48, 16x16
4. Save as PNG files
5. Put in `icons/` folder

### 2. Load Extension in Chrome

1. Open Chrome browser
2. Type in address bar: `chrome://extensions/`
3. Press Enter
4. Enable "Developer mode" (top right corner)
5. Click "Load unpacked" (top left)
6. Select the `FolderMark` folder
7. Extension should now appear in toolbar

### 3. Test the Extension

1. Click FolderMark icon in toolbar
2. You should see:
   - FolderMark title
   - Search box
   - Statistics cards (Total Folders, Total Bookmarks, etc.)
   - Tabs (Folders, Empty, Duplicates, Settings)
3. Click "Folders" tab → should show your bookmark folders
4. Click "Empty" tab → should scan for empty folders
5. Try searching, sorting, etc.

### 4. Troubleshooting

#### Extension not loading?

- Check if all files exist
- Check `manifest.json` format (should be valid JSON)
- Check Chrome console for errors (right-click extension → Inspect popup)

#### Icons not showing?

- Make sure icon files exist in `icons/` folder
- Check file names match `manifest.json`
- Try removing icon references temporarily (see ICONS.md)

#### Bookmarks not showing?

- Make sure you have bookmarks in Chrome
- Check Chrome Bookmarks API permission
- Try refreshing the extension

#### Errors in console?

- Right-click FolderMark icon → "Inspect popup"
- Check Console tab for errors
- Common issues:
  - Missing files
  - Import path errors
  - CORS errors (shouldn't happen in extensions)

### 5. Development Mode

To modify the extension:

1. Edit any file
2. Go to `chrome://extensions/`
3. Click "Refresh" button on FolderMark card
4. Test changes

### 6. Package for Chrome Web Store (Optional)

When ready to publish:

1. Zip the entire `FolderMark` folder
2. Go to Chrome Web Store Developer Dashboard
3. Upload zip file
4. Fill in store listing details
5. Submit for review

## File Checklist

Make sure these files exist:

- ✅ `manifest.json`
- ✅ `popup/popup.html`
- ✅ `popup/popup.css`
- ✅ `popup/popup.js`
- ✅ `src/core/bookmarkService.js`
- ✅ `src/core/storageService.js`
- ✅ `src/core/scanner.js`
- ✅ `src/features/emptyFolderDetector.js`
- ✅ `src/features/duplicateDetector.js`
- ✅ `src/features/folderOperations.js`
- ✅ `src/features/bookmarkMover.js`
- ✅ `src/utils/constants.js`
- ✅ `src/utils/helpers.js`
- ✅ `src/utils/i18n.js`
- ✅ `src/ui/theme.js`
- ✅ `_locales/en/messages.json`
- ✅ `_locales/zh_CN/messages.json`
- ✅ `icons/icon16.png`
- ✅ `icons/icon48.png`
- ✅ `icons/icon128.png`

## Next Steps

After installation:

1. Explore all tabs
2. Test folder operations (rename, delete, etc.)
3. Check dark mode in Settings
4. Switch language to 中文
5. Export bookmark structure
6. Report any bugs or issues

## Support

If you encounter issues:

1. Check `INSTALL.md` troubleshooting section
2. Check Chrome console for errors
3. Verify all files are present
4. Try reloading the extension

---

**Enjoy organizing your bookmarks faster with FolderMark! 📁**
