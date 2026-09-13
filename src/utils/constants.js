/**
 * Constants - 常量定义
 * 存储键、事件类型、配置项等
 */

// 存储键定义
export const STORAGE_KEYS = {
  THEME: 'foldermark_theme',
  LANGUAGE: 'foldermark_language',
  DELETE_CONFIRM: 'foldermark_delete_confirm',
  HIDE_ROOT_FOLDERS: 'foldermark_hide_root_folders',
  ACTION_POSITION: 'foldermark_action_position',
  LAST_SCAN: 'foldermark_last_scan',
  SCAN_RESULT: 'foldermark_scan_result',
  FOLDER_NOTES: 'foldermark_folder_notes',
  FOLDER_ICONS: 'foldermark_folder_icons'
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
  deleteConfirm: true,
  hideRootFolders: false,
  actionPosition: 'right'
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
  DUPLICATES: 'duplicates',
  SMART: 'smart',
  STATS: 'stats',
  SETTINGS: 'settings'
};

// 排序方式
export const SORT_TYPES = {
  NAME: 'name',
  BOOKMARK_COUNT: 'bookmarkCount',
  PATH: 'path',
  DATE: 'date'
};

// 主题列表（用于设置下拉的「主色预览点」+ 按色相分组）
// primary 取各主题 CSS 变量中的 --primary 作为代表色
export const THEME_LIST = [
  { key: 'light',      i18n: 'themeLight',      primary: '#D97706' },
  { key: 'dark',       i18n: 'themeDark',       primary: '#FCD34D' },
  { key: 'blush',      i18n: 'themeBlush',      primary: '#E88B8B' },
  { key: 'matcha',     i18n: 'themeMatcha',     primary: '#7A9056' },
  { key: 'latte',      i18n: 'themeLatte',      primary: '#8B7355' },
  { key: 'iris',       i18n: 'themeIris',       primary: '#7B68B2' },
  { key: 'sky',        i18n: 'themeSky',        primary: '#5BA3CF' },
  { key: 'coral',      i18n: 'themeCoral',      primary: '#D6635A' },
  { key: 'rose',       i18n: 'themeRose',       primary: '#C73E5C' },
  { key: 'mint',       i18n: 'themeMint',       primary: '#2EAE9A' },
  { key: 'slate',      i18n: 'themeSlate',      primary: '#64748B' },
  { key: 'teal',       i18n: 'themeTeal',       primary: '#0EA5A0' },
  { key: 'lavender',   i18n: 'themeLavender',   primary: '#A2AADB' },
  { key: 'springmist', i18n: 'themeSpringmist', primary: '#9BA3C7' },
  { key: 'mauve',      i18n: 'themeMauve',      primary: '#C599B6' },
  { key: 'holly',      i18n: 'themeHolly',      primary: '#6D0808' },
  { key: 'autumn',     i18n: 'themeAutumn',     primary: '#84994F' },
  { key: 'aqua',       i18n: 'themeAqua',       primary: '#30AFFF' },
  { key: 'nebula',     i18n: 'themeNebula',     primary: '#831C91' },
  { key: 'sunrise',    i18n: 'themeSunrise',    primary: '#E86A3F' }
];

// 搜索类型
export const SEARCH_TYPES = {
  FOLDER_NAME: 'folderName',
  BOOKMARK_TITLE: 'bookmarkTitle',
  URL: 'url'
};
