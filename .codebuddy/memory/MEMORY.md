# FolderMark 项目长期记忆

## 主题命名规则（与 daily-tracker 不同）
- FolderMark 主题中文显示名**允许 2 个汉字**（不受 daily-tracker 的「3 字」规则限制）。
- 主题系统为配置驱动：`data-theme` 值 + `popup.css` 变量块 + 下拉 `<option>` + `_locales` 的 `themeXxx` 键。加新主题只需四处改动。
- 已加主题清单（2026-07-28）：
  - 浅色 Light `light` / 暗色 Dark `dark`（默认内置）
  - 腮粉 Blush `blush`（pastel pink）
  - 抹茶 Matcha `matcha`（sage green）
  - 拿铁 Latte `latte`（warm coffee brown）
- 通用无障碍做法：主按钮一律「浅色底 + 深色字」，logo/stat-number 用更深的同色系文字，确保 WCAG AA；`header` 有硬编码渐变需按主题覆盖。

## 关于/维护区重构（2026-07-28）
- 原「关于」区已更名为「维护（Maintenance）」，内含「重新扫描书签(Rescan Bookmarks)」与「恢复默认设置(Restore Defaults)」两个按钮（之前删除了隐私按钮）。
- 已移除「跟随系统(System)」主题选项；默认主题改为 `light`，清理了 `src/ui/theme.js` 的 matchMedia 监听与 getSystemTheme 逻辑。
