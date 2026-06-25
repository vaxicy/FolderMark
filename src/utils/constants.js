/**
 * Constants - 常量定义
 * 存储键、事件类型、配置项等
 */

// 存储键定义
export const STORAGE_KEYS = {
  THEME: 'foldermark_theme',
  LANGUAGE: 'foldermark_language',
  DELETE_CONFIRM: 'foldermark_delete_confirm',
  LAST_SCAN: 'foldermark_last_scan',
  SCAN_RESULT: 'foldermark_scan_result'
};

// 主题类型
export const THEMES = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system'
};

// 默认配置
export const DEFAULT_SETTINGS = {
  theme: THEMES.SYSTEM,
  language: 'en',
  deleteConfirm: true
};

// 事件类型定义
export const EVENTS = {
  FOLDERS_UPDATED: 'foldermark_folders_updated',
  EMPTY_FOLDERS_UPDATED: 'foldermark_empty_folders_updated',
  DUPLICATES_UPDATED: 'foldermark_duplicates_updated',
  THEME_CHANGED: 'foldermark_theme_changed',
  LANGUAGE_CHANGED: 'foldermark_language_changed'
};

// Tab 类型
export const TABS = {
  FOLDERS: 'folders',
  EMPTY: 'empty',
  DUPLICATES: 'duplicates',
  SETTINGS: 'settings'
};

// 排序方式
export const SORT_TYPES = {
  NAME: 'name',
  BOOKMARK_COUNT: 'bookmarkCount',
  PATH: 'path',
  DATE: 'date'
};

// 搜索类型
export const SEARCH_TYPES = {
  FOLDER_NAME: 'folderName',
  BOOKMARK_TITLE: 'bookmarkTitle',
  URL: 'url'
};
