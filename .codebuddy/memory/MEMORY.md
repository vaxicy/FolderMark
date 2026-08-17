# FolderMark 项目长期记忆

## 主题命名规则（与 daily-tracker 不同）
- FolderMark 主题中文显示名**允许 2 个汉字**（不受 daily-tracker 的「3 字」规则限制）。
- 主题系统为配置驱动：`data-theme` 值 + `popup.css` 变量块 + 下拉 `<option>` + `_locales` 的 `themeXxx` 键。加新主题只需四处改动。
- 已加主题清单（2026-07-28）：
  - 浅色 Light `light` / 暗色 Dark `dark`（默认内置）
  - 腮粉 Blush `blush`、抹茶 Matcha `matcha`、拿铁 Latte `latte`、鸢尾 Iris `iris`、晴空 Sky `sky`、珊瑚 Coral `coral`、玫红 Rose `rose`、薄荷 Mint `mint`、银灰 Slate `slate`、湖青 Teal `teal`、薰紫 Lavender `lavender`、春雾 SpringMist `springmist`（2026-08-17 新增）
  - 共 14 个主题（light/dark + 12 个彩色）
- 通用无障碍做法：主按钮一律「浅色底 + 深色字」，logo/stat-number 用更深的同色系文字，确保 WCAG AA；`header` 有硬编码渐变需按主题覆盖。

## 关于/维护区（2026-07-28 重构）
- 原「关于」区已更名为「维护（Maintenance）」，内含「重新扫描书签」与「恢复默认设置」两个按钮（隐私按钮已删）。
- 已移除「跟随系统」主题选项；默认主题 `light`，清理了 matchMedia 监听。

## i18n 新增语言的标准流程（重要，跨会话稳定）
- locale 文件：`_locales/{lang}/messages.json`，与 `en` 的 key 必须完全对齐（用 `python -c "import json;json.load(...)"` 校验 missing/extra 为空）。当前支持 en / zh_CN / es / ja / ko / **ru（俄语，2026-08-17 新增，第 6 种）**。
- `popup.js` 中颜色/预设名取词：用辅助方法 `_langName(dict)`（字典含 `{zh,en,es,ja,ko,ru}`）、`_colorNameOf(entry)`（颜色库数组列索引 4=zh,5=en,6=es,7=ja,8=ko,9=ru）、`_customColorLabel()`。
- 颜色库（约 146 条，`guessColorName`）每条需含 6 个名称列（zh/en/es/ja/ko/ru）。
- 日期格式：`toLocaleString` 的 locale 映射在 `formatTime` 内（zh-CN/en-US/es-ES/ja-JP/ko-KR/ru-RU）。
- 语言下拉在 `popup.html` 的 `#languageSelect`（已加 `<option value="ru">Русский</option>`）。
- **不要**再散落 `this.language === 'zh_CN' ? zh : (this.language==='es' ? es : en)` 三元；统一用上述辅助方法，否则新增语言会漏改。
- smartClassify 的「文件夹名→颜色」关键词映射已覆盖 zh/en/es/ja/ko/ru 六语言（6 色 × 若干词/色）。
- manifest 的 `default_locale` 为 `en`，多 locale 自动生效，无需改 manifest。
- 加新语言标准步骤：① 建 `_locales/{lang}/messages.json`（280 key 与 en 对齐，**值必须是 `{ "message": "..." }` 对象，不能是扁平字符串**）② `_langName` keyMap、`_colorNameOf` idx、`_customColorLabel` 字典、`formatTime` locale 都加该语言 ③ `presetList`/`presetMap` 各条目加该语言字段 ④ colorDB 每条追加名称列 ⑤ `smartClassify` 关键词加该语言 ⑥ `popup.html` 下拉加 option ⑦ 校验 6 locale key 对齐 + 值类型为 object + `node --check popup.js`。
- 新增 locale 后必做格式检查：`node -e "const v=Object.values(require('./_locales/{lang}/messages.json'))[0]; console.log(typeof v);"` 应输出 `object`，若为 `string` 则 `i18n.getMessage` 会返回 `undefined`，导致标签空白/placeholder 显示 undefined。
