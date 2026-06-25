# FolderMark - Bookmark Folder Organizer

Organize your bookmark folders faster.

## Features

### MVP Core Features

1. **Folder Overview**
   - Display all bookmark folders
   - Show folder name, bookmark count, subfolder count, path, last modified time
   - Search folders

2. **Folder Operations**
   - Rename folder
   - Delete empty folder
   - Open folder
   - Copy folder path

3. **Empty Folder Cleanup**
   - Auto-scan all empty folders
   - Show: Found X empty folders
   - Support single delete and batch delete

4. **Duplicate Folder Detection**
   - Detect folders with same name
   - Show possible duplicate folders
   - Manual handling (no auto-merge in v1.0)

5. **Folder Merge**
   - Select two folders to merge
   - Move all bookmarks and subfolders from A to B
   - Ask whether to delete empty folder A

6. **Bookmark Move**
   - View bookmarks in a folder
   - Select bookmarks to move to other folders

7. **Search**
   - Search folder name
   - Search bookmark title
   - Search URL

8. **Sort**
   - Sort by name
   - Sort by bookmark count
   - Sort by path
   - Sort by update time

## Tech Stack

- Manifest V3
- Vanilla JavaScript
- Chrome Bookmarks API
- Chrome Storage Local
- No backend
- No login required
- Dark mode support
- Chinese/English support

## Permissions

- `bookmarks` - Access bookmark data
- `storage` - Save user settings

## Installation

1. Open Chrome browser
2. Go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the `FolderMark` folder

## Usage

1. Click the FolderMark icon in the toolbar
2. View folder statistics on the homepage
3. Switch tabs to:
   - **Folders**: View and manage all folders
   - **Empty**: View and clean empty folders
   - **Duplicates**: View possible duplicate folders
   - **Settings**: Configure extension settings
4. Use search box to find specific folders
5. Use sort dropdown to sort folders
6. Click folder actions to rename, merge, open, or delete

## Data Safety

- All data processed locally
- No bookmarks uploaded to any server
- No user data collected
- All delete and merge operations require confirmation

## Privacy

All data is processed locally. No bookmarks are uploaded to any server. Your privacy is fully protected.

## Development

### Project Structure

```
FolderMark/
├── manifest.json
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── src/
│   ├── core/
│   │   ├── bookmarkService.js
│   │   ├── storageService.js
│   │   └── scanner.js
│   ├── features/
│   │   ├── emptyFolderDetector.js
│   │   ├── duplicateDetector.js
│   │   ├── folderOperations.js
│   │   └── bookmarkMover.js
│   ├── ui/
│   │   └── theme.js
│   └── utils/
│       ├── constants.js
│       ├── helpers.js
│       └── i18n.js
├── _locales/
│   ├── en/
│   │   └── messages.json
│   └── zh_CN/
│       └── messages.json
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Icons

To create icons, you can:

1. Use any image editor to create PNG icons of size 16x16, 48x48, and 128x128
2. Name them `icon16.png`, `icon48.png`, `icon128.png`
3. Place them in the `icons/` folder

Or use the provided placeholder icons (not recommended for production).

## Future Features (Not in v1.0)

- ❌ Cloud sync
- ❌ Login/Register
- ❌ AI classification
- ❌ Auto-organize all bookmarks
- ❌ Auto-delete duplicate bookmarks
- ❌ Payment system
- ❌ Team sharing

## Design Style

Inspired by:
- Raycast
- Linear
- Notion

Requirements:
- Simple
- Modern
- Clear
- Strong sense of security
- Clear confirmation before operations

## License

MIT

## Author

Built with ❤️ for better bookmark organization
