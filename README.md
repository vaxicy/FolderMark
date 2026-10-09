# 📁 FolderMark

> 书签文件夹管理器 · Organize your bookmarks faster.

FolderMark 是一款 Chrome 浏览器扩展，帮助你高效管理和组织书签文件夹。提供文件夹概览、空文件夹清理、重复检测、智能清理建议、批量操作等功能，让书签管理变得轻松有序。

---

## ✨ 功能特性

### 📂 文件夹管理
- **文件夹概览** — 展示所有书签文件夹的名称、书签数、子文件夹数、路径、最后修改时间
- **新建文件夹** — 在书签栏根目录快速创建新文件夹
- **重命名文件夹** — 原地重命名任意文件夹
- **删除文件夹** — 支持删除空文件夹或包含子项的文件夹树（系统根文件夹受保护）
- **合并文件夹** — 将源文件夹内容合并到目标文件夹，自动清理空源文件夹
- **打开文件夹** — 在 Chrome 书签管理器中快速定位文件夹
- **复制路径** — 一键复制文件夹路径到剪贴板

### 🎨 视觉定制
- **文件夹颜色标签** — 8 种预设颜色 + 自定义颜色，为文件夹添加视觉标记
- **文件夹图标** — 20+ 种预设 Emoji 图标，个性化文件夹
- **颜色筛选** — 按颜色过滤文件夹列表，快速定位
- **主题切换** — 浅色/深色/跟随系统三种主题
- **操作按钮位置** — 支持靠左或靠右布局

### 🔍 智能检测
- **空文件夹检测** — 自动扫描所有空文件夹，支持单删和批量清理（带撤销）
- **重复文件夹检测** — 按名称检测同名文件夹，显示路径和书签数，支持合并
- **重复书签检测** — 按 URL 检测重复书签，支持选择保留哪个
- **失效书签检测** — HTTP 请求验证书签 URL 是否可访问，批量删除失效链接
- **健康评分仪表盘** — 圆形进度条展示书签库健康度，颜色随评分变化（绿/黄/红）

### 💡 智能功能
- **智能清理建议** — 基于空文件夹、未使用文件夹、小文件夹、重复项生成清理建议
- **智能分类** — 根据文件夹名称自动推荐颜色标签
- **统计面板** — 总文件夹数、总书签数、平均书签数、着色比例、颜色分布图、大小分布图

### 📝 备注与元数据
- **文件夹备注** — 为每个文件夹添加文本备注
- **批量添加备注** — 选中多个文件夹，批量设置相同备注

### 🔄 批量操作
- **批量选择** — 复选框多选 + 全选
- **批量设色** — 为选中文件夹统一设置颜色
- **批量合并** — 将多个文件夹合并到目标
- **批量删除** — 一键删除多个文件夹（可撤销）
- **批量导出** — 导出选中文件夹信息为 JSON

### ↩️ 撤销恢复
- **删除撤销** — 删除前自动快照，支持撤销恢复（最多 10 条历史）
- **撤销 Toast** — 删除后 5 秒内可撤销
- **撤销历史面板** — 在设置页查看历史，可逐条恢复

### 📦 数据导入/导出
- **导出配置** — 导出颜色、图标、备注、设置等为 JSON 文件
- **导入配置** — 从 JSON 文件恢复配置
- **自动备份** — 危险操作前自动导出备份

### ⚙️ 设置
- 主题选择（系统/浅色/深色）
- 语言切换（英文/中文）
- 删除确认开关
- 隐藏根文件夹
- 操作按钮位置
- 恢复默认设置
- 刷新数据

### ⌨️ 快捷键与右键菜单
- **快捷键** — `Ctrl+Shift+F` 快速打开弹窗
- **右键菜单** — 页面右键提供 "Open FolderMark" 和 "保存当前页面到书签"

### 🌐 国际化
- 支持英语（en）和简体中文（zh_CN）
- 路径自动适配语言（书签栏 ↔ Bookmarks Bar）

---

## 📸 截图

| English | 中文 |
|---------|------|
| ![Screenshot EN](store-assets-real-cn-en/screenshots/en/foldermark-screenshot-1.png) | ![截图 ZH](store-assets-real-cn-en/screenshots/zh/foldermark-screenshot-1.png) |
| ![Screenshot EN](store-assets-real-cn-en/screenshots/en/foldermark-screenshot-2.png) | ![截图 ZH](store-assets-real-cn-en/screenshots/zh/foldermark-screenshot-2.png) |
| ![Screenshot EN](store-assets-real-cn-en/screenshots/en/foldermark-screenshot-3.png) | ![截图 ZH](store-assets-real-cn-en/screenshots/zh/foldermark-screenshot-3.png) |

---

## 🚀 安装

### Chrome 网上应用店

[**Chrome Web Store 安装**](https://chromewebstore.google.com/detail/foldermark-bookmark-folde/iekmdcaeedhalcneidfankmelhkcdmgn?authuser=0&hl=zh-CN)

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Install-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/foldermark-bookmark-folde/iekmdcaeedhalcneidfankmelhkcdmgn?authuser=0&hl=zh-CN)

### 开发者模式安装
1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `FolderMark` 文件夹

---

## 📖 使用指南

1. 点击工具栏中的 FolderMark 图标
2. **首页** — 查看书签统计概览（总文件夹数、书签数、空文件夹数、重复数）
3. **Folders 标签** — 搜索、排序、管理所有文件夹
4. **Duplicates 标签** — 查看重复文件夹和重复书签
5. **Smart 标签** — 查看健康评分、检测失效书签、空文件夹、获取清理建议
6. **Stats 标签** — 查看统计图表和智能分类建议
7. **Settings 标签** — 配置主题、语言、导入导出等

---

## 🔒 隐私安全

- **所有数据在本地处理** — 书签数据不会上传到任何服务器
- **最小权限原则** — 仅需 `bookmarks` 和 `storage` 权限
- **失效书签检测可选** — 仅在点击扫描时发出 HTTP 请求
- **所有删除和合并操作需确认** — 防止误操作
- **撤销恢复** — 误删可一键恢复

---

## 🏗 技术栈

| 技术 | 说明 |
|------|------|
| Manifest V3 | 最新 Chrome 扩展规范 |
| Vanilla JavaScript | 原生 JS，无框架依赖 |
| Chrome Bookmarks API | 书签数据读写 |
| Chrome Storage API | 本地配置持久化 |
| Chrome i18n API | 国际化支持 |
| CSS 自定义属性 | 主题系统 |

---

## 📁 项目结构

```
FolderMark/
├── manifest.json              # 扩展清单
├── background.js              # Service Worker（右键菜单 + 快捷键）
├── popup/
│   ├── popup.html             # 弹窗主界面
│   ├── popup.css              # 样式（含深色主题）
│   └── popup.js               # 主交互逻辑
├── src/
│   ├── core/
│   │   ├── bookmarkService.js      # Bookmarks API 封装
│   │   ├── scanner.js              # 书签树递归扫描
│   │   └── storageService.js       # Storage API 封装
│   ├── features/
│   │   ├── bookmarkMover.js             # 书签移动
│   │   ├── brokenBookmarkDetector.js    # 失效书签检测
│   │   ├── duplicateBookmarkDetector.js # 重复书签检测
│   │   ├── duplicateDetector.js         # 重复文件夹检测
│   │   ├── emptyFolderDetector.js       # 空文件夹检测
│   │   ├── folderAccessService.js       # 访问统计
│   │   ├── folderColorService.js        # 颜色标签
│   │   ├── folderIconService.js         # 图标管理
│   │   ├── folderOperations.js          # 文件夹操作
│   │   ├── notesService.js              # 备注服务
│   │   ├── smartCleanupSuggestions.js   # 智能清理建议
│   │   └── undoService.js               # 撤销服务
│   ├── ui/
│   │   ├── modalService.js       # 模态弹窗
│   │   └── theme.js              # 主题管理
│   └── utils/
│       ├── constants.js          # 常量定义
│       ├── helpers.js            # 工具函数
│       ├── i18n.js               # 国际化
│       └── iconGenerator.js      # 图标生成器
├── _locales/
│   ├── en/messages.json          # 英文翻译
│   └── zh_CN/messages.json       # 中文翻译
├── icons/                        # 扩展图标
├── icon-generator.html           # 图标生成工具
└── store-assets-real-cn-en/      # 商店素材
```

---

## 🧪 开发

### 环境要求
- Chrome 浏览器（支持 Manifest V3）
- 无需 Node.js 或构建工具

### 本地开发
1. 克隆仓库
2. 以开发者模式加载扩展
3. 修改代码后，在 `chrome://extensions/` 点击刷新按钮

### 代码质量
- 原生 JavaScript ES6+，使用 `import`/`export` 模块系统
- 无外部依赖，轻量高效
- 输入验证和错误处理覆盖
- 所有用户操作需确认

---

## 📄 许可

本软件采用 **非商业使用许可证 (Non-Commercial License)**。详见 [LICENSE](./LICENSE)。

- ✅ 个人使用、学习研究免费
- ✅ 非商业分发需保留版权和许可声明
- ❌ 未经授权不得用于商业目的
- 📧 商业使用请联系作者

---

## 👤 作者

Built with ❤️ by [vaxicy](https://github.com/vaxicy)
