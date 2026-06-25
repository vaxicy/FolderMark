# FolderMark Quick Start Guide

## ⚡ Test Without Icons (Fastest Way)

You can test the extension RIGHT NOW without creating icon files!

### Step 1: Remove Icon References (Temporary)

Edit `manifest.json` and change it to:

```json
{
  "manifest_version": 3,
  "name": "__MSG_extensionName__",
  "version": "1.0.0",
  "description": "__MSG_extensionDescription__",
  "permissions": [
    "bookmarks",
    "storage"
  ],
  "action": {
    "default_popup": "popup/popup.html"
  },
  "default_locale": "en"
}
```

(Removed `icons` and `default_icon` references)

### Step 2: Load in Chrome

1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select `FolderMark` folder
6. Done! Extension loads without icons

### Step 3: Test

1. Click extension icon in toolbar (it will show default puzzle piece icon)
2. Should see FolderMark popup
3. Test all features

---

## 🎨 Add Icons Later (Optional)

When you want proper icons:

### Option A: Use Emoji (Easiest)

1. Open https://emojipedia.org/ 📁
2. Copy 📁 emoji
3. Paste in Paint/Photoshop
4. Save as PNG (16x16, 48x48, 128x128)
5. Put in `icons/` folder
6. Update `manifest.json` to add icon references back

### Option B: Use Online Generator

1. Go to https://favicon.io/favicon-generator/
2. Type "FM" (FolderMark)
3. Choose blue color
4. Download
5. Rename to icon16.png, icon48.png, icon128.png
6. Put in `icons/` folder

### Option C: Download Free Icons

1. Go to https://www.flaticon.com/free-icons/bookmark
2. Download bookmark folder icons
3. Resize to required dimensions
4. Put in `icons/` folder

---

## 🧪 Test Checklist

After loading extension:

- [ ] Popup opens when clicking icon
- [ ] Statistics show (Total Folders, Bookmarks, etc.)
- [ ] "Folders" tab shows your bookmark folders
- [ ] Search box works
- [ ] Sort dropdown works
- [ ] "Empty" tab scans empty folders
- [ ] "Duplicates" tab shows duplicate folders
- [ ] "Settings" tab allows changing theme/language
- [ ] Dark mode toggle works
- [ ] Language switch works (English ↔ 中文)

---

## 🐛 Common Issues

### Popup doesn't open?

- Check if all files exist
- Check Chrome console (right-click icon → Inspect popup)
- Look for JavaScript errors

### No folders showing?

- Make sure you have bookmarks in Chrome
- Try clicking "Refresh Data" in Settings
- Check console for API errors

### Styling looks broken?

- Make sure `popup.css` is loaded
- Check file path in `popup.html`
- Clear cache and reload extension

---

## 📝 Development Tips

### Auto-reload on file change?

Install Chrome extension "Extensions Reloader":
- Go to Chrome Web Store
- Search "Extensions Reloader"
- Install
- Click reload button to refresh all extensions

### Debug popup?

1. Right-click FolderMark icon
2. Click "Inspect popup"
3. See Console for errors
4. Use Debugger to step through code

### Test different scenarios?

- Create test bookmarks/folders
- Test with empty folders
- Test with duplicate folder names
- Test with large bookmark collections

---

## ✅ What Works Now

With current code:

1. ✅ Folder scanning
2. ✅ Empty folder detection
3. ✅ Duplicate folder detection
4. ✅ Search folders
5. ✅ Sort folders
6. ✅ Rename folder
7. ✅ Delete empty folder
8. ✅ Open folder (opens bookmarks in new tabs)
9. ✅ Copy folder path
10. ✅ Dark/Light theme
11. ✅ English/Chinese language
12. ✅ Export bookmark structure
13. ✅ Confirm dialogs for dangerous actions

## ⚠️ What Needs Completion

1. ⚠️ Folder merge UI (backend ready, need frontend)
2. ⚠️ Bookmark move UI (backend ready, need frontend)
3. ⚠️ Advanced duplicate handling
4. ⚠️ Batch operations UI

---

## 🚀 Next Steps

1. Test current features
2. Report bugs
3. Suggest improvements
4. Add missing UI for merge/move features

---

**Good luck! The core functionality is working. Icons are optional for testing. 📁**
