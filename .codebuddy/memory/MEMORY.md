# FolderMark 项目长期记忆

## 主题命名规则（与 daily-tracker 不同）
- FolderMark 主题中文显示名**允许 2 个汉字**（不受 daily-tracker 的「3 字」规则限制）。
- 主题系统为配置驱动：`data-theme` 值 + `popup.css` 变量块 + 下拉 `<option>` + `_locales` 的 `themeXxx` 键。加新主题只需四处改动。
- 已加主题清单（2026-07-28）：
  - 浅色 Light `light` / 暗色 Dark `dark`（默认内置）
  - 腮粉 Blush `blush`、抹茶 Matcha `matcha`、拿铁 Latte `latte`、鸢尾 Iris `iris`、晴空 Sky `sky`、珊瑚 Coral `coral`、玫红 Rose `rose`、薄荷 Mint `mint`
  - 共 10 个主题（light/dark + 8 个彩色）
- 通用无障碍做法：主按钮一律「浅色底 + 深色字」，logo/stat-number 用更深的同色系文字，确保 WCAG AA；`header` 有硬编码渐变需按主题覆盖。

## 关于/维护区（2026-07-28 重构）
- 原「关于」区已更名为「维护（Maintenance）」，内含「重新扫描书签」与「恢复默认设置」两个按钮（隐私按钮已删）。
- 已移除「跟随系统」主题选项；默认主题 `light`，清理了 matchMedia 监听。

## i18n 新增语言的标准流程（重要，跨会话稳定）
- locale 文件：`_locales/{lang}/messages.json`，与 `en` 的 key 必须完全对齐（用 `python -c "import json;json.load(...)"` 校验 missing/extra 为空）。当前支持 en / zh_CN / es / ja / ko。
- `popup.js` 中颜色/预设名取词：用辅助方法 `_langName(dict)`（字典含 `{zh,en,es,ja,ko}`）、`_colorNameOf(entry)`（颜色库数组列索引 4=zh,5=en,6=es,7=ja,8=ko）、`_customColorLabel()`。
- 颜色库（约 146 条，`guessColorName`）每条需含 5 个名称列（zh/en/es/ja/ko）。
- 日期格式：`toLocaleString` 的 locale 映射在 `formatTime` 内（zh-CN/en-US/es-ES/ja-JP/ko-KR）。
- 语言下拉在 `popup.html` 的 `#languageSelect`。
- **不要**再散落 `this.language === 'zh_CN' ? zh : (this.language==='es' ? es : en)` 三元；统一用上述辅助方法，否则新增语言会漏改。
- smartClassify 的「文件夹名→颜色」关键词映射（zh/en）未覆盖 ja/ko，日韩文件夹名不会被智能分类命中（仅影响该功能）。
- manifest 的 `default_locale` 为 `en`，多 locale 自动生效，无需改 manifest。
