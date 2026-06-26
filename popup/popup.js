/**
 * FolderMark - Popup Main Logic
 * 主交互逻辑
 */

import i18n from '../src/utils/i18n.js';
import theme from '../src/ui/theme.js';
import FolderScanner from '../src/core/scanner.js';
import EmptyFolderDetector from '../src/features/emptyFolderDetector.js';
import DuplicateDetector from '../src/features/duplicateDetector.js';
import DuplicateBookmarkDetector from '../src/features/duplicateBookmarkDetector.js';
import SmartCleanupSuggestions from '../src/features/smartCleanupSuggestions.js';
import BrokenBookmarkDetector from '../src/features/brokenBookmarkDetector.js';
import FolderColorService from '../src/features/folderColorService.js';
import FolderIconService from '../src/features/folderIconService.js';
import FolderAccessService from '../src/features/folderAccessService.js';
import FolderOperations from '../src/features/folderOperations.js';
import NotesService from '../src/features/notesService.js';
import UndoService from '../src/features/undoService.js';
import BookmarkService from '../src/core/bookmarkService.js';
import { STORAGE_KEYS, TABS, SORT_TYPES } from '../src/utils/constants.js';
import { formatDate, debounce, showNotification, exportToJSON } from '../src/utils/helpers.js';

class App {
  constructor() {
    this.currentTab = TABS.FOLDERS;
    this.folders = [];
    this.emptyFolders = [];
    this.duplicates = [];
    this.duplicateBookmarks = []; // 重复书签
    this.brokenBookmarks = []; // 失效书签
    this.folderColors = {}; // 文件夹颜色 {folderId: colorValue}
    this.folderIcons = {}; // 文件夹图标 {folderId: iconValue}
    this.colorFilter = ''; // 当前颜色筛选
    this._colorPickerOpenTime = 0; // 颜色选择器打开时间戳（防止立即关闭）
    this._iconPickerOpenTime = 0; // 图标选择器打开时间戳（防止立即关闭）
    this._customColorFolderId = ''; // 正在设置自定义颜色的目标文件夹 ID
    this._undoToastTimer = null;      // 撤销 Toast 自动关闭定时器
    this.cleanupSuggestions = []; // 清理建议
    this.expandedFolders = new Set(); // 当前展开的文件夹 ID 集合
    this._focusedFolderIndex = -1;   // 键盘导航当前焦点索引
    this.searchMode = 'folder';            // 搜索模式：folder / bookmark
    this._bookmarkSearchResults = {}; // { folderId: [bookmark, ...] }
    this.currentSort = SORT_TYPES.NAME;
    this.searchQuery = '';
    this._mergeSourceId = null;
    this.selectedFolderIds = new Set(); // 批量选择
    this.init();
  }

  /**
   * 初始化应用
   */
  async init() {
    try {
      await this.loadSettings();
      await i18n.init(this.language);
      await theme.init(this.theme);
      this.bindEvents();

      // 加载颜色和图标
      this.folderColors = await FolderColorService.loadColors();
      this.folderIcons = await FolderIconService.loadIcons();

      await this.scanBookmarks();

      // 检查是否有待保存的页面（从右键菜单触发）
      await this.checkPendingSave();
    } catch (error) {
      console.error('Initialization failed:', error);
      showNotification('Initialization failed: ' + error.message, 'error');
    }
  }

  /**
   * 检查是否有待保存的页面（从右键菜单触发）
   */
  async checkPendingSave() {
    return new Promise((resolve) => {
      chrome.storage.local.get('foldermark_pending_save', (result) => {
        if (result.foldermark_pending_save) {
          const pageInfo = result.foldermark_pending_save;
          // 显示保存对话框
          this.showSaveToFolderDialog(pageInfo);
          // 清除待保存标记
          chrome.storage.local.remove('foldermark_pending_save');
        }
        resolve();
      });
    });
  }

  /**
   * 显示「保存到文件夹」对话框
   */
  showSaveToFolderDialog(pageInfo) {
    // 简化方案：直接保存到书签栏，显示通知
    const folderList = this.folders.filter(f => !f.isRoot).map(f => f.title).join('\n');
    const choice = prompt(
      `${i18n.getMessage('savePageConfirm') || 'Save page to bookmarks?'}\n\n${pageInfo.title}\n\n${i18n.getMessage('selectFolder') || 'Select folder (or cancel to save to bookmark bar):'}`,
      this.folders.length > 0 ? this.folders[0].title : ''
    );

    if (choice === null) {
      // 用户取消，保存到书签栏
      this.doSavePage(pageInfo, '1');
    } else if (choice) {
      // 查找匹配的文件夹
      const targetFolder = this.folders.find(f => f.title === choice);
      if (targetFolder) {
        this.doSavePage(pageInfo, targetFolder.id);
      } else {
        // 创建新文件夹并保存
        BookmarkService.createFolder(choice, '1')
          .then(newFolder => {
            this.doSavePage(pageInfo, newFolder.id);
          })
          .catch(err => {
            showNotification('Save failed: ' + err.message, 'error');
          });
      }
    }
  }

  /**
   * 执行保存页面到书签
   */
  doSavePage(pageInfo, parentId) {
    BookmarkService.createBookmark(pageInfo.title, pageInfo.url, parentId)
      .then(() => {
        showNotification(i18n.getMessage('pageSaved') || 'Page saved to bookmarks', 'success');
        this.scanBookmarks();
      })
      .catch(err => {
        showNotification('Save failed: ' + err.message, 'error');
      });
  }

  /**
   * 加载设置
   */
  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get([
        STORAGE_KEYS.THEME,
        STORAGE_KEYS.LANGUAGE,
        STORAGE_KEYS.DELETE_CONFIRM
      ], (result) => {
        this.theme = result[STORAGE_KEYS.THEME] || 'system';
        this.language = result[STORAGE_KEYS.LANGUAGE] || 'en';
        this.deleteConfirm = result[STORAGE_KEYS.DELETE_CONFIRM] !== false;
        resolve();
      });
    });
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // Tab 切换
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchTab(tab.dataset.tab);
      });
    });

    // 搜索模式切换
    const searchModeBtn = document.getElementById('searchModeBtn');
    if (searchModeBtn) {
      searchModeBtn.addEventListener('click', () => {
        this.searchMode = this.searchMode === 'folder' ? 'bookmark' : 'folder';
        this.updateSearchModeUI();
        this.renderFolders();
      });
    }

    // 搜索
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', debounce((e) => {
      this.searchQuery = e.target.value;
      this.renderFolders();
    }, 300));

    // 排序
    const sortSelect = document.getElementById('sortSelect');
    sortSelect.addEventListener('change', (e) => {
      this.currentSort = e.target.value;
      this.renderFolders();
    });

    // 主题切换
    document.getElementById('themeToggle').addEventListener('click', () => {
      this.toggleTheme();
    });

    // 设置 - 主题选择
    const themeSelect = document.getElementById('themeSelect');
    themeSelect.value = this.theme;
    themeSelect.addEventListener('change', (e) => {
      this.changeTheme(e.target.value);
    });

    // 设置 - 语言选择
    const languageSelect = document.getElementById('languageSelect');
    languageSelect.value = this.language;
    languageSelect.addEventListener('change', (e) => {
      this.changeLanguage(e.target.value);
    });

    // 设置 - 删除确认
    const deleteConfirmToggle = document.getElementById('deleteConfirmToggle');
    deleteConfirmToggle.checked = this.deleteConfirm;
    deleteConfirmToggle.addEventListener('change', (e) => {
      this.toggleDeleteConfirm(e.target.checked);
    });

    // 设置 - 导入
    document.getElementById('importStructure').addEventListener('click', () => {
      this.importStructure();
    });

    // 设置 - 导出
    document.getElementById('exportStructure').addEventListener('click', () => {
      this.exportStructure();
    });

    // 设置 - 恢复默认设置
    document.getElementById('restoreDefaults').addEventListener('click', () => {
      this.restoreDefaults();
    });

    // 设置 - 隐私
    document.getElementById('privacyInfo').addEventListener('click', () => {
      this.showPrivacyInfo();
    });

    // 设置 - 刷新
    document.getElementById('refreshData').addEventListener('click', () => {
      this.scanBookmarks();
    });

    // 新建文件夹
    document.getElementById('newFolderBtn').addEventListener('click', () => {
      this.createFolder();
    });

    // 空文件夹 - 清理全部
    document.getElementById('cleanAllEmpty').addEventListener('click', () => {
      this.cleanAllEmptyFolders();
    });

    // 批量操作 - 全选
    document.getElementById('selectAllCheckbox').addEventListener('change', (e) => {
      this.toggleSelectAll(e.target.checked);
    });

    // 批量操作 - 删除
    document.getElementById('batchDeleteBtn').addEventListener('click', () => {
      this.batchDelete();
    });

    // 批量操作 - 合并
    document.getElementById('batchMergeBtn').addEventListener('click', () => {
      this.batchMerge();
    });

    // 批量操作 - 导出
    document.getElementById('batchExportBtn').addEventListener('click', () => {
      this.batchExport();
    });

    // 批量操作 - 应用颜色
    document.getElementById('batchColorBtn').addEventListener('click', () => {
      this.batchSetColor();
    });

    // 批量操作 - 添加备注
    document.getElementById('batchNoteBtn').addEventListener('click', () => {
      this.batchAddNote();
    });

    // 批量颜色弹窗 - 关闭
    document.getElementById('batchColorCancel').addEventListener('click', () => {
      this.closeBatchColorModal();
    });
    document.getElementById('batchColorOverlay').addEventListener('click', () => {
      this.closeBatchColorModal();
    });

    // 批量备注弹窗 - 关闭/保存
    document.getElementById('batchNoteCancel').addEventListener('click', () => {
      this.closeBatchNoteModal();
    });
    document.getElementById('batchNoteOverlay').addEventListener('click', () => {
      this.closeBatchNoteModal();
    });
    document.getElementById('batchNoteSave').addEventListener('click', () => {
      this.saveBatchNote();
    });

    // 确认弹窗
    document.getElementById('modalCancel').addEventListener('click', () => {
      this.closeModal();
    });
    document.getElementById('modalConfirm').addEventListener('click', () => {
      this.executeConfirmAction();
    });
    document.getElementById('confirmModal').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) {
        this.closeModal();
      }
    });

    // 合并弹窗
    document.getElementById('mergeCancel').addEventListener('click', () => {
      this.closeMergeModal();
    });
    document.getElementById('mergeModal').addEventListener('click', (e) => {
      if (e.target.classList.contains('merge-modal-overlay')) {
        this.closeMergeModal();
      }
    });

    // 智能功能 - 清理重复书签
    document.getElementById('cleanDuplicatesBtn').addEventListener('click', () => {
      this.cleanDuplicateBookmarks();
    });

    // 智能功能 - 扫描失效书签
    document.getElementById('scanBrokenBtn').addEventListener('click', () => {
      this.scanBrokenBookmarks();
    });

    // 智能功能 - 清理失效书签
    const cleanBrokenBtn = document.getElementById('cleanBrokenBtn');
    if (cleanBrokenBtn) {
      cleanBrokenBtn.addEventListener('click', () => {
        this.cleanBrokenBookmarks();
      });
    }

    // 统计卡片点击
    document.querySelectorAll('.stat-card').forEach(card => {
      card.addEventListener('click', () => {
        const stat = card.dataset.stat;
        this.handleStatCardClick(stat);
      });
    });

    // 快捷键
    document.addEventListener('keydown', (e) => {
      this.handleKeyboard(e);
    });

    // 颜色筛选
    const colorFilterSelect = document.getElementById('colorFilterSelect');
    if (colorFilterSelect) {
      colorFilterSelect.addEventListener('change', (e) => {
        this.colorFilter = e.target.value;
        this.renderFolders();
      });
    }

    // 自定义颜色选择器 - 确认选择
    const customColorInput = document.getElementById('customColorInput');
    if (customColorInput) {
      customColorInput.addEventListener('input', async (e) => {
        const color = e.target.value;
        const folderId = this._customColorFolderId;
        if (!folderId || !color) return;

        // 批量模式
        if (folderId === '_batch_') return;

        await FolderColorService.setColor(folderId, color);
        this.folderColors = await FolderColorService.loadColors();
        this.folders.forEach(f => {
          f._color = this.folderColors[f.id] || '';
        });
        this.renderFolders();
      });
      // 取消选择时也要刷新（关闭颜色面板）
      customColorInput.addEventListener('change', async (e) => {
        const color = e.target.value;
        const folderId = this._customColorFolderId;

        if (folderId === '_batch_') {
          // 批量模式：应用自定义颜色到所有选中文件夹
          const ids = Array.from(this.selectedFolderIds);
          let success = 0;
          for (const id of ids) {
            try {
              await FolderColorService.setColor(id, color);
              success++;
            } catch (error) {
              console.error('Set color failed for ' + id + ':', error);
            }
          }

          this._customColorFolderId = '';

          if (success > 0) {
            showNotification(
              (i18n.getMessage('batchColorSuccess') || 'Set color for $1 folders').replace('$1', success),
              'success'
            );
            await this.scanBookmarks();
          }
          return;
        }

        this._customColorFolderId = '';
      });
    }

    // 颜色选择器 - 点击其他地方关闭（带防抖保护）
    document.addEventListener('click', (e) => {
      const picker = document.getElementById('colorPickerPanel');
      if (!picker || picker.classList.contains('hidden')) return;
      // 防抖：打开后 150ms 内不响应关闭
      if (Date.now() - this._colorPickerOpenTime < 150) return;
      // 检查点击是否在面板内部或颜色点上
      const isColorDot = e.target.classList.contains('color-dot') ||
                         e.target.closest('.folder-color-dot');
      if (!picker.contains(e.target) && !isColorDot) {
        picker.classList.add('hidden');
      }
    });

    // 图标选择器 - 点击其他地方关闭（带防抖保护）
    document.addEventListener('click', (e) => {
      const panel = document.getElementById('iconPickerPanel');
      if (!panel || panel.classList.contains('hidden')) return;
      // 防抖：打开后 150ms 内不响应关闭
      if (Date.now() - this._iconPickerOpenTime < 150) return;
      // 检查点击是否在面板内部或图标按钮上
      const isIconBtn = e.target.classList.contains('folder-icon-display') ||
                        e.target.closest('.folder-icon-btn');
      if (!panel.contains(e.target) && !isIconBtn) {
        panel.classList.add('hidden');
      }
    });

    // 撤销按钮
    document.getElementById('undoBtn').addEventListener('click', async () => {
      await this.executeUndo();
    });
  }

  /**
   * 快捷键处理
   */
  handleKeyboard(e) {
    // 忽略在输入框中的按键（除了特定快捷键）
    const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT';

    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        if (!inInput && this.selectedFolderIds.size > 0) {
          e.preventDefault();
          this.batchDelete();
        }
        break;
      case 'z':
        // Ctrl+Z / Cmd+Z 撤销
        if ((e.ctrlKey || e.metaKey) && !inInput) {
          e.preventDefault();
          if (UndoService && UndoService.canUndo()) {
            this.executeUndo();
          }
        }
        break;
      case 'F2':
        if (!inInput) {
          e.preventDefault();
          // 单选时重命名
          if (this.selectedFolderIds.size === 1) {
            const id = Array.from(this.selectedFolderIds)[0];
            this.renameFolder(id);
          }
        }
        break;
      case 'a':
        if ((e.ctrlKey || e.metaKey) && !inInput) {
          e.preventDefault();
          this.toggleSelectAll(true);
          const selectAllCheckbox = document.getElementById('selectAllCheckbox');
          if (selectAllCheckbox) selectAllCheckbox.checked = true;
        }
        break;
      case 'Escape':
        // 优先关闭弹窗
        const confirmModal = document.getElementById('confirmModal');
        const mergeModal = document.getElementById('mergeModal');
        if (confirmModal && confirmModal.style.display === 'flex') {
          this.closeModal();
        } else if (mergeModal && mergeModal.style.display === 'flex') {
          this.closeMergeModal();
        } else if (this.selectedFolderIds.size > 0) {
          e.preventDefault();
          this.clearSelection();
        } else {
          // 清除搜索
          const searchInput = document.getElementById('searchInput');
          if (searchInput && searchInput.value) {
            searchInput.value = '';
            this.searchQuery = '';
            this.renderFolders();
          }
        }
        break;
      case '/':
        // / 聚焦搜索框
        if (!inInput) {
          e.preventDefault();
          const searchInput = document.getElementById('searchInput');
          searchInput.focus();
          searchInput.select();
        }
        break;
      case 'f':
        // Ctrl+F / Cmd+F 聚焦搜索框
        if ((e.ctrlKey || e.metaKey) && !inInput) {
          e.preventDefault();
          const searchInput = document.getElementById('searchInput');
          searchInput.focus();
          searchInput.select();
        }
        break;
      case 'n':
        // Ctrl+N / Cmd+N 新建文件夹
        if ((e.ctrlKey || e.metaKey) && !inInput) {
          e.preventDefault();
          this.createFolder();
        }
        break;
      case '1':
      case '2':
      case '3':
      case '4':
        // 数字键切换 Tab
        if (!inInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const tabs = ['folders', 'empty', 'duplicates', 'settings'];
          const tabIndex = parseInt(e.key) - 1;
          if (tabIndex < tabs.length) {
            this.switchTab(tabs[tabIndex]);
          }
        }
        break;
      case 'ArrowUp':
        // 上箭头：焦点移到上一个文件夹卡片
        if (!inInput && this.currentTab === TABS.FOLDERS) {
          e.preventDefault();
          const cards = Array.from(document.querySelectorAll('.folder-card'));
          if (cards.length === 0) break;
          if (this._focusedFolderIndex <= 0) {
            this._focusedFolderIndex = cards.length - 1;
          } else {
            this._focusedFolderIndex--;
          }
          cards.forEach(c => c.classList.remove('focused'));
          cards[this._focusedFolderIndex].classList.add('focused');
          cards[this._focusedFolderIndex].focus();
          cards[this._focusedFolderIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
        break;
      case 'ArrowDown':
        // 下箭头：焦点移到下一个文件夹卡片
        if (!inInput && this.currentTab === TABS.FOLDERS) {
          e.preventDefault();
          const cards = Array.from(document.querySelectorAll('.folder-card'));
          if (cards.length === 0) break;
          if (this._focusedFolderIndex >= cards.length - 1) {
            this._focusedFolderIndex = 0;
          } else {
            this._focusedFolderIndex++;
          }
          cards.forEach(c => c.classList.remove('focused'));
          cards[this._focusedFolderIndex].classList.add('focused');
          cards[this._focusedFolderIndex].focus();
          cards[this._focusedFolderIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
        break;
      case 'Enter':
        // Enter：展开/收起当前焦点的文件夹
        if (!inInput && this.currentTab === TABS.FOLDERS) {
          const active = document.activeElement;
          if (active && active.classList.contains('folder-card')) {
            e.preventDefault();
            const folderId = active.dataset.folderId;
            if (folderId) {
              this.toggleExpand(folderId);
            }
          }
        }
        break;
      case ' ':
        // Space：切换当前焦点文件夹的选中状态
        if (!inInput && this.currentTab === TABS.FOLDERS) {
          const active = document.activeElement;
          if (active && active.classList.contains('folder-card')) {
            e.preventDefault();
            const folderId = active.dataset.folderId;
            if (folderId) {
              const cb = active.querySelector('input[type="checkbox"]');
              if (cb) {
                cb.checked = !cb.checked;
                this.toggleFolderSelection(folderId, cb.checked);
              }
            }
          }
        }
        break;
    }
  }

  /**
   * 扫描书签
   */
  async scanBookmarks() {
    try {
      this.showLoading(true);
      const scanner = new FolderScanner();
      const result = await scanner.scanAll();
      this.folders = result.folders;

      const notes = await NotesService.loadNotes();
      this.folders.forEach(folder => {
        folder.note = notes[folder.id] || '';
      });

      this.emptyFolders = EmptyFolderDetector.detectFromList(this.folders);
      this.duplicates = DuplicateDetector.detect(this.folders);

      // 加载文件夹颜色
      this.folderColors = await FolderColorService.loadColors();
      this.folders.forEach(folder => {
        folder._color = this.folderColors[folder.id] || '';
      });
      
      // 扫描重复书签
      const bookmarkTree = await this.getBookmarkTree();
      this.duplicateBookmarks = DuplicateBookmarkDetector.detect(bookmarkTree);
      
      // 生成清理建议（传入已计算的 duplicates 和访问数据）
      const accessData = await FolderAccessService.loadAccessData();
      this.cleanupSuggestions = SmartCleanupSuggestions.generateSuggestions(this.folders, this.duplicates, accessData);
      
      this.updateStats();
      this.clearSelection();
      this.renderCurrentPage();
      this.showLoading(false);
    } catch (error) {
      console.error('Scan failed:', error);
      this.showLoading(false);
      showNotification('Scan failed: ' + error.message, 'error');
    }
  }
  
  /**
   * 获取书签树
   */
  async getBookmarkTree() {
    return new Promise((resolve, reject) => {
      chrome.bookmarks.getTree((bookmarkTreeNodes) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(bookmarkTreeNodes);
        }
      });
    });
  }

  /**
   * 切换 Tab
   */
  switchTab(tab) {
    if (this.currentTab === tab) return;
    const oldPage = document.getElementById(`${this.currentTab}Page`);
    const newPage = document.getElementById(`${tab}Page`);
    if (oldPage) oldPage.classList.remove('active');
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    if (newPage) newPage.classList.add('active');
    this.currentTab = tab;
    this.clearSelection();
    this.renderCurrentPage();
  }

  /**
   * 处理统计卡片点击
   */
  handleStatCardClick(stat) {
    switch (stat) {
      case 'folders':
        this.switchTab(TABS.FOLDERS);
        break;
      case 'bookmarks':
        this.switchTab(TABS.FOLDERS);
        this.currentSort = SORT_TYPES.BOOKMARK_COUNT;
        document.getElementById('sortSelect').value = SORT_TYPES.BOOKMARK_COUNT;
        this.renderFolders();
        break;
      case 'empty':
        this.switchTab(TABS.EMPTY);
        break;
      case 'duplicates':
        this.switchTab(TABS.DUPLICATES);
        break;
    }
  }

  /**
   * 更新搜索模式 UI
   */
  updateSearchModeUI() {
    const btn = document.getElementById('searchModeBtn');
    const input = document.getElementById('searchInput');
    if (!btn) return;
    if (this.searchMode === 'folder') {
      btn.textContent = '📁';
      btn.classList.remove('active');
      btn.title = i18n.getMessage('searchModeFolder') || 'Search folders';
      input.placeholder = i18n.getMessage('searchPlaceholder') || 'Search folders...';
    } else {
      btn.textContent = '🔗';
      btn.classList.add('active');
      btn.title = i18n.getMessage('searchModeBookmark') || 'Search bookmarks';
      input.placeholder = i18n.getMessage('searchBookmarkPlaceholder') || 'Search bookmarks...';
    }
  }

  /**
   * 渲染当前页面
   */
  renderCurrentPage() {
    switch (this.currentTab) {
      case TABS.FOLDERS:
        this.renderFolders();
        break;
      case TABS.EMPTY:
        this.renderEmptyFolders();
        break;
      case TABS.DUPLICATES:
        this.renderDuplicates();
        break;
      case TABS.SMART:
        this.renderSmartPage();
        break;
      case TABS.SETTINGS:
        this.renderSettings();
        break;
    }
  }

  /**
   * 渲染文件夹列表（含复选框）
   */
  async renderFolders() {
    const container = document.getElementById('foldersList');
    let folders = [];

    if (!this.searchQuery || this.searchMode === 'folder') {
      // 文件夹名称搜索（或空搜索）
      let list = FolderScanner.searchFolders(this.folders, this.searchQuery);
      // 颜色筛选
      if (this.colorFilter) {
        list = list.filter(f => f._color === this.colorFilter);
      }
      folders = FolderScanner.sortFolders(list, this.currentSort);
    } else if (this.searchMode === 'bookmark' && this.searchQuery) {
      // 书签内容搜索
      await this.renderBookmarkSearchResults(container);
      return;
    }

    if (folders.length === 0 && !this.searchQuery) {
      container.innerHTML = '<div class="empty-state"><p>' + i18n.getMessage('noFoldersFound') + '</p></div>';
      return;
    }
    if (folders.length === 0 && this.searchQuery) {
      container.innerHTML = '<div class="empty-state"><p>' + (i18n.getMessage('noSearchResults') || 'No results found') + '</p></div>';
      return;
    }

    container.innerHTML = folders.map(folder => this.createFolderCard(folder)).join('');
    this.bindFolderCardEvents();
    this.restoreSelectionState();
  }

  /**
   * 渲染书签内容搜索结果
   * @param {HTMLElement} container - 列表容器
   */
  async renderBookmarkSearchResults(container) {
    if (!this.searchQuery) {
      // 无搜索词时显示全部文件夹
      const folders = FolderScanner.sortFolders(this.folders, this.currentSort);
      container.innerHTML = folders.map(folder => this.createFolderCard(folder)).join('');
      this.bindFolderCardEvents();
      this.restoreSelectionState();
      return;
    }

    try {
      const results = await BookmarkService.search(this.searchQuery);
      // 按 parentId 分组
      const folderMap = {};
      for (const item of results) {
        if (!item.url) continue; // 跳过文件夹
        const parentId = item.parentId;
        if (!folderMap[parentId]) folderMap[parentId] = [];
        folderMap[parentId].push(item);
      }

      // 获取父文件夹信息并去重
      const folderIds = [...new Set(results.filter(r => r.url).map(r => r.parentId))];
      const folderInfos = [];
      for (const id of folderIds) {
        const folder = this.folders.find(f => f.id === id);
        if (folder) {
          folderInfos.push({ folder, bookmarks: folderMap[id] || [] });
        }
      }

      if (folderInfos.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>' + (i18n.getMessage('noSearchResults') || 'No results found') + '</p></div>';
        return;
      }

      // 按匹配书签数排序
      folderInfos.sort((a, b) => b.bookmarks.length - a.bookmarks.length);

      container.innerHTML = folderInfos.map(({ folder, bookmarks }) => {
        const card = this.createFolderCard(folder);
        // 自动展开并显示匹配的书签
        setTimeout(() => {
          this.renderBookmarkMatches(folder.id, bookmarks);
        }, 50);
        return card;
      }).join('');

      this.bindFolderCardEvents();
      this.restoreSelectionState();

      // 自动展开匹配的文件夹
      for (const { folder } of folderInfos) {
        this.expandedFolders.add(folder.id);
        setTimeout(() => {
          const detailsEl = document.querySelector(`.folder-details[data-details-for="${folder.id}"]`);
          const btnEl = document.querySelector(`.folder-expand-btn[data-folder-id="${folder.id}"]`);
          if (detailsEl) {
            detailsEl.classList.remove('hidden');
            detailsEl.classList.add('open');
          }
          if (btnEl) {
            btnEl.classList.add('expanded');
            const chevron = btnEl.querySelector('.expand-chevron');
            if (chevron) {
              chevron.classList.remove('chevron-right');
              chevron.classList.add('chevron-down');
            }
          }
        }, 100);
      }
    } catch (error) {
      console.error('Bookmark search failed:', error);
      container.innerHTML = '<div class="empty-state"><p>' + (i18n.getMessage('searchError') || 'Search failed') + '</p></div>';
    }
  }

  /**
   * 在展开的文件夹中显示匹配的书签
   */
  renderBookmarkMatches(folderId, bookmarks) {
    const contentEl = document.querySelector(`.folder-details-content[data-content-for="${folderId}"]`);
    if (!contentEl) return;

    let html = `<div class="details-section">
      <div class="details-section-title">🔗 ${i18n.getMessage('matchingBookmarks') || 'Matching Bookmarks'} (${bookmarks.length})</div>
      ${bookmarks.slice(0, 30).map(b => `
        <div class="details-item details-bookmark-item" data-bookmark-id="${b.id}" data-bookmark-url="${this.escapeHtml(b.url)}" title="${this.escapeHtml(b.url)}">
          <span style="color:var(--primary);">★</span>
          <span class="details-item-name">${this.escapeHtml(b.title || b.url)}</span>
          <button class="details-item-delete" data-bookmark-id="${b.id}" title="${i18n.getMessage('delete') || 'Delete'}">×</button>
        </div>
      `).join('')}
      ${bookmarks.length > 30 ? `<div class="details-more">+${bookmarks.length - 30} more...</div>` : ''}
    </div>`;

    contentEl.innerHTML = html;

    // 绑定事件委托（打开 + 删除）
    this.bindDetailsEvents(folderId);
  }

  /**
   * 创建文件夹卡片 HTML（含复选框、颜色条、图标、展开按钮）
   */
  createFolderCard(folder) {
    const isSelected = this.selectedFolderIds.has(folder.id);
    const isEmpty = folder.isEmpty;
    const color = folder._color || '';
    const colorStyle = color ? `border-left-color: ${FolderColorService.getHex(color)};` : '';
    const icon = this.folderIcons[folder.id] || ''; // 自定义图标
    const displayIcon = icon || '📁'; // 默认图标
    const isExpanded = this.expandedFolders.has(folder.id);
    const expandClass = isExpanded ? 'expanded' : '';
    const chevronClass = isExpanded ? 'chevron-down' : 'chevron-right';
    return `
      <div class="folder-card ${isSelected ? 'selected' : ''}" data-folder-id="${folder.id}" tabindex="0">
        <div class="folder-card-header">
          <label class="folder-checkbox">
            <input type="checkbox" data-folder-id="${folder.id}" ${isSelected ? 'checked' : ''}>
          </label>
          <button class="folder-expand-btn ${expandClass}" data-folder-id="${folder.id}" title="${i18n.getMessage('toggleExpand') || 'Expand'}">
            <span class="expand-chevron ${chevronClass}">▸</span>
          </button>
          <div class="folder-icon-btn" data-folder-id="${folder.id}" title="${i18n.getMessage('setIcon') || 'Set icon'}">
            <span class="folder-icon-display">${displayIcon}</span>
          </div>
          <div class="folder-color-dot" data-folder-id="${folder.id}" title="${i18n.getMessage('setColor') || 'Set color'}">
            ${color ? `<span class="color-dot" style="background:${FolderColorService.getHex(color)}"></span>` : '🎨'}
          </div>
          <div class="folder-header" style="${colorStyle}">
            <div>
              <div class="folder-name">
                <span class="folder-title-text">${this.escapeHtml(folder.title)}</span>
              </div>
              <div class="folder-path">${this.escapeHtml(folder.path)}</div>
            </div>
          </div>
        </div>
        <div class="folder-stats">
          <span class="folder-stat">📄 ${folder.bookmarkCount}</span>
          <span class="folder-stat">📁 ${folder.subfolderCount}</span>
          ${folder.dateGroupModified ? '<span class="folder-stat">🕒 ' + formatDate(folder.dateGroupModified) + '</span>' : ''}
        </div>
        <div class="folder-actions">
          <button class="btn btn-secondary btn-sm" data-action="open" data-folder-id="${folder.id}">${i18n.getMessage('open')}</button>
          <button class="btn btn-secondary btn-sm" data-action="merge" data-folder-id="${folder.id}">${i18n.getMessage('merge')}</button>
          <button class="btn btn-secondary btn-sm" data-action="rename" data-folder-id="${folder.id}">${i18n.getMessage('rename')}</button>
          ${!folder.isRoot ? `<button class="btn btn-danger btn-sm" data-action="delete" data-folder-id="${folder.id}">${i18n.getMessage('delete')}</button>` : ''}
        </div>
        <div class="folder-notes">
          <textarea class="notes-input" data-folder-id="${folder.id}" placeholder="${i18n.getMessage('addNote') || 'Add a note...'}" rows="2">${folder.note || ''}</textarea>
        </div>
        <div class="folder-details ${isExpanded ? 'open' : 'hidden'}" data-details-for="${folder.id}">
          <div class="folder-details-loading" style="display:none;">
            <div class="spinner" style="width:12px;height:12px;"></div>
            <span style="font-size:10px;color:var(--text-tertiary);">${i18n.getMessage('loading') || 'Loading...'}</span>
          </div>
          <div class="folder-details-content" data-content-for="${folder.id}"></div>
        </div>
      </div>
    `;
  }

  /**
   * 显示颜色选择器
   */
  showColorPicker(folderId, targetEl) {
    const panel = document.getElementById('colorPickerPanel');
    const options = document.getElementById('colorPickerOptions');
    const presets = FolderColorService.getPresets();

    options.innerHTML = presets.map(p => {
      // 自定义颜色选项：显示彩虹圆点
      if (p.value === '__custom__') {
        return `
          <div class="color-picker-option custom-option" data-color="__custom__" data-folder-id="${folderId}">
            <span class="color-dot custom-color-dot"></span>
            <span class="color-label">${i18n.getMessage('color' + p.label) || p.label}</span>
          </div>
        `;
      }
      // 无颜色选项
      if (p.value === '') {
        return `
          <div class="color-picker-option no-color" data-color="" data-folder-id="${folderId}">
            <span style="font-size:12px;opacity:0.5;">✕</span>
            <span class="color-label">${i18n.getMessage('color' + p.label) || p.label}</span>
          </div>
        `;
      }
      // 预设颜色
      return `
        <div class="color-picker-option" data-color="${p.value}" data-folder-id="${folderId}">
          <span class="color-dot" style="background:${p.hex}"></span>
          <span class="color-label">${i18n.getMessage('color' + p.label) || p.label}</span>
        </div>
      `;
    }).join('');

    // 绑定颜色选择事件
    options.querySelectorAll('.color-picker-option').forEach(opt => {
      opt.addEventListener('click', async (e) => {
        e.stopPropagation();
        const color = e.currentTarget.dataset.color;

        // 自定义颜色：触发系统颜色选择器
        if (color === '__custom__') {
          this._customColorFolderId = folderId;
          panel.classList.add('hidden');
          // 如果文件夹已有自定义颜色，以该颜色作为默认值
          const currentColor = this.folderColors[folderId] || '#3B82F6';
          const colorInput = document.getElementById('customColorInput');
          colorInput.value = currentColor.startsWith('#') ? currentColor : '#3B82F6';
          colorInput.click();
          return;
        }

        await FolderColorService.setColor(folderId, color);
        this.folderColors = await FolderColorService.loadColors();
        this.folders.forEach(f => {
          f._color = this.folderColors[f.id] || '';
        });
        panel.classList.add('hidden');
        this.renderFolders();
      });
    });

    // 定位面板（带边界检测）
    const rect = targetEl.getBoundingClientRect();
    const panelWidth = 150;
    const panelHeight = 200;

    let top = rect.bottom + 4;
    let left = rect.left;

    // 边界检测：防止超出右边缘
    if (left + panelWidth > window.innerWidth) {
      left = window.innerWidth - panelWidth - 4;
    }
    if (left < 0) left = 4;

    // 边界检测：防止超出底部，改为向上弹出
    if (top + panelHeight > window.innerHeight) {
      top = rect.top - panelHeight - 4;
    }
    if (top < 0) top = 4;

    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;

    // 标记打开时间（防止 document click 立即关闭）
    this._colorPickerOpenTime = Date.now();
    panel.classList.remove('hidden');
  }

  /**
   * 显示图标选择器
   */
  showIconPicker(folderId, targetEl) {
    const panel = document.getElementById('iconPickerPanel');
    const options = document.getElementById('iconPickerOptions');
    const presets = FolderIconService.getPresets();

    options.innerHTML = presets.map(p => {
      // 构造 i18n key：label 首字母大写以匹配 locale 文件中的 PascalCase key
      const iconKey = 'icon' + p.label.charAt(0).toUpperCase() + p.label.slice(1);
      // 无图标选项（使用默认 📁）
      if (p.value === '') {
        return `
          <div class="icon-picker-option no-icon" data-icon="" data-folder-id="${folderId}">
            <span class="icon-display">📁</span>
            <span class="icon-label">${i18n.getMessage(iconKey) || 'Default'}</span>
          </div>
        `;
      }
      // 预设图标
      return `
        <div class="icon-picker-option" data-icon="${p.value}" data-folder-id="${folderId}">
          <span class="icon-display">${p.icon}</span>
          <span class="icon-label">${i18n.getMessage(iconKey) || p.label}</span>
        </div>
      `;
    }).join('');

    // 绑定图标选择事件
    options.querySelectorAll('.icon-picker-option').forEach(opt => {
      opt.addEventListener('click', async (e) => {
        e.stopPropagation();
        const icon = e.currentTarget.dataset.icon;

        await FolderIconService.setIcon(folderId, icon);
        this.folderIcons = await FolderIconService.loadIcons();
        panel.classList.add('hidden');
        this.renderFolders();
      });
    });

    // 定位面板（带边界检测）
    const rect = targetEl.getBoundingClientRect();
    const panelWidth = 200;
    const panelHeight = 250;

    let top = rect.bottom + 4;
    let left = rect.left;

    // 边界检测：防止超出右边缘
    if (left + panelWidth > window.innerWidth) {
      left = window.innerWidth - panelWidth - 4;
    }
    if (left < 0) left = 4;

    // 边界检测：防止超出底部，改为向上弹出
    if (top + panelHeight > window.innerHeight) {
      top = rect.top - panelHeight - 4;
    }
    if (top < 0) top = 4;

    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;

    // 标记打开时间（防止 document click 立即关闭）
    this._iconPickerOpenTime = Date.now();
    panel.classList.remove('hidden');
  }

  /**
   * 绑定文件夹卡片事件
   */
  bindFolderCardEvents() {
    const container = document.getElementById('foldersList');
    if (!container) return;

    // 展开/收起按钮
    document.querySelectorAll('.folder-expand-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const folderId = e.currentTarget.dataset.folderId;
        this.toggleExpand(folderId);
      });
    });

    // 图标按钮
    document.querySelectorAll('.folder-icon-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const folderId = e.currentTarget.dataset.folderId;
        this.showIconPicker(folderId, e.currentTarget);
      });
    });

    // 颜色点
    document.querySelectorAll('.folder-color-dot').forEach(dot => {
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        const folderId = e.currentTarget.dataset.folderId;
        this.showColorPicker(folderId, e.currentTarget);
      });
    });

    // 复选框
    document.querySelectorAll('.folder-checkbox input').forEach(cb => {
      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        const folderId = e.target.dataset.folderId;
        this.toggleFolderSelection(folderId, e.target.checked);
      });
    });

    // 操作按钮
    document.querySelectorAll('[data-action]').forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = e.target.dataset.action;
        const folderId = e.target.dataset.folderId;
        this.handleFolderAction(action, folderId);
      });
    });

    // 备注输入
    if (container) {
      container.addEventListener('blur', (e) => {
        if (e.target.classList.contains('notes-input')) {
          const folderId = e.target.dataset.folderId;
          const note = e.target.value;
          this.saveFolderNote(folderId, note);
        }
      }, true);
    }
  }

  /**
   * 展开/收起文件夹详情
   * @param {string} folderId - 文件夹 ID
   */
  async toggleExpand(folderId) {
    const detailsEl = document.querySelector(`.folder-details[data-details-for="${folderId}"]`);
    const btnEl = document.querySelector(`.folder-expand-btn[data-folder-id="${folderId}"]`);
    if (!detailsEl) return;

    if (this.expandedFolders.has(folderId)) {
      // 收起
      this.expandedFolders.delete(folderId);
      detailsEl.classList.remove('open');
      detailsEl.classList.add('hidden');
      if (btnEl) {
        btnEl.classList.remove('expanded');
        const chevron = btnEl.querySelector('.expand-chevron');
        if (chevron) {
          chevron.classList.remove('chevron-down');
          chevron.classList.add('chevron-right');
        }
      }
      return;
    }

    // 展开
    this.expandedFolders.add(folderId);
    detailsEl.classList.remove('hidden');
    detailsEl.classList.add('open');
    if (btnEl) {
      btnEl.classList.add('expanded');
      const chevron = btnEl.querySelector('.expand-chevron');
      if (chevron) {
        chevron.classList.remove('chevron-right');
        chevron.classList.add('chevron-down');
      }
    }

    // 记录访问
    await FolderAccessService.recordAccess(folderId);

    // 加载内容
    await this.renderFolderDetails(folderId);
  }

  /**
   * 渲染文件夹详情（子文件夹 + 书签列表）
   * @param {string} folderId - 文件夹 ID
   */
  async renderFolderDetails(folderId) {
    const contentEl = document.querySelector(`.folder-details-content[data-content-for="${folderId}"]`);
    const loadingEl = document.querySelector(`.folder-details[data-details-for="${folderId}"] .folder-details-loading`);
    if (!contentEl) return;

    if (loadingEl) loadingEl.style.display = 'flex';
    contentEl.innerHTML = '';

    try {
      const children = await BookmarkService.getChildren(folderId);
      const subfolders = [];
      const bookmarks = [];

      for (const child of children) {
        if (child.children) {
          subfolders.push(child);
        } else if (child.url) {
          bookmarks.push(child);
        }
      }

      let html = '';

      // 子文件夹
      if (subfolders.length > 0) {
        html += `<div class="details-section">
          <div class="details-section-title">📁 ${i18n.getMessage('subfolders') || 'Subfolders'} (${subfolders.length})</div>
          ${subfolders.map(f => `
            <div class="details-item details-folder-item">
              <span class="details-folder-icon">📁</span>
              <span class="details-item-name">${this.escapeHtml(f.title)}</span>
              <span class="details-item-count">${f.children ? f.children.length : 0}</span>
            </div>
          `).join('')}
        </div>`;
      }

      // 书签列表
      if (bookmarks.length > 0) {
        html += `<div class="details-section">
          <div class="details-section-title">📄 ${i18n.getMessage('bookmarks') || 'Bookmarks'} (${bookmarks.length})</div>
          ${bookmarks.slice(0, 20).map(b => `
            <div class="details-item details-bookmark-item" data-bookmark-id="${b.id}" data-bookmark-url="${this.escapeHtml(b.url)}" title="${this.escapeHtml(b.url)}">
              <span class="details-bookmark-favicon">🔗</span>
              <span class="details-item-name">${this.escapeHtml(b.title || b.url)}</span>
              <button class="details-item-delete" data-bookmark-id="${b.id}" title="${i18n.getMessage('delete') || 'Delete'}">×</button>
            </div>
          `).join('')}
          ${bookmarks.length > 20 ? `<div class="details-more">+${bookmarks.length - 20} ${i18n.getMessage('more') || 'more'}...</div>` : ''}
        </div>`;
      }

      if (subfolders.length === 0 && bookmarks.length === 0) {
        html = `<div class="details-empty">${i18n.getMessage('emptyFolder') || 'Empty folder'}</div>`;
      }

      contentEl.innerHTML = html;

      // 绑定事件委托（打开 + 删除）
      this.bindDetailsEvents(folderId);
    } catch (error) {
      console.error('Render folder details failed:', error);
      contentEl.innerHTML = `<div class="details-error">${i18n.getMessage('loadFailed') || 'Load failed'}</div>`;
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
    }
  }

  /**
   * 为文件夹详情面板绑定事件委托（打开书签 + 删除书签）
   * 使用事件委托，只绑定一次
   * @param {string} folderId - 文件夹 ID
   */
  bindDetailsEvents(folderId) {
    const contentEl = document.querySelector(`.folder-details-content[data-content-for="${folderId}"]`);
    if (!contentEl || contentEl.dataset.eventsBound) return;

    contentEl.dataset.eventsBound = 'true';
    contentEl.addEventListener('click', async (e) => {
      // 检查是否点击了删除按钮
      const deleteBtn = e.target.closest('.details-item-delete');
      if (deleteBtn) {
        e.stopPropagation();
        const bookmarkId = deleteBtn.dataset.bookmarkId;
        if (!bookmarkId) return;

        const doDelete = async () => {
          try {
            await BookmarkService.removeNode(bookmarkId);
            showNotification(i18n.getMessage('bookmarkDeleted') || 'Bookmark deleted', 'success');
            // 刷新面板
            await this.renderFolderDetails(folderId);
          } catch (error) {
            showNotification('Delete failed: ' + error.message, 'error');
          }
        };

        if (this.deleteConfirm) {
          this.showConfirmModal(
            i18n.getMessage('confirmDeleteBookmark') || 'Delete Bookmark',
            i18n.getMessage('confirmDeleteBookmarkMessage') || 'Delete this bookmark?',
            doDelete
          );
        } else {
          await doDelete();
        }
        return;
      }

      // 检查是否点击了书签项（打开书签）
      const bookmarkItem = e.target.closest('.details-bookmark-item');
      if (bookmarkItem) {
        const url = bookmarkItem.dataset.bookmarkUrl;
        if (url) {
          chrome.tabs.create({ url });
        }
      }
    });
  }

  /**
   * 切换文件夹选中状态
   */
  toggleFolderSelection(folderId, selected) {
    if (selected) {
      this.selectedFolderIds.add(folderId);
    } else {
      this.selectedFolderIds.delete(folderId);
    }
    this.updateBatchBar();
  }

  /**
   * 全选/取消全选
   */
  toggleSelectAll(selectAll) {
    const container = document.getElementById('foldersList');
    const folderCards = container.querySelectorAll('.folder-card');
    
    if (selectAll) {
      folderCards.forEach(card => {
        const id = card.dataset.folderId;
        this.selectedFolderIds.add(id);
      });
    } else {
      this.selectedFolderIds.clear();
    }
    
    // 更新复选框状态
    folderCards.forEach(card => {
      const cb = card.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = selectAll;
    });
    
    this.updateBatchBar();
  }

  /**
   * 清除选择
   */
  clearSelection() {
    this.selectedFolderIds.clear();
    document.getElementById('selectAllCheckbox').checked = false;
    this.updateBatchBar();
  }

  /**
   * 恢复选择状态（重新渲染后）
   */
  restoreSelectionState() {
    const container = document.getElementById('foldersList');
    if (!container) return;
    
    container.querySelectorAll('.folder-card').forEach(card => {
      const id = card.dataset.folderId;
      const cb = card.querySelector('input[type="checkbox"]');
      if (this.selectedFolderIds.has(id)) {
        card.classList.add('selected');
        if (cb) cb.checked = true;
      } else {
        card.classList.remove('selected');
        if (cb) cb.checked = false;
      }
    });
    
    this.updateBatchBar();
  }

  /**
   * 更新批量操作栏
   */
  updateBatchBar() {
    const bar = document.getElementById('batchBar');
    const count = this.selectedFolderIds.size;
    
    if (count > 0 && this.currentTab === TABS.FOLDERS) {
      bar.classList.remove('hidden');
    } else {
      bar.classList.add('hidden');
    }
    
    document.getElementById('batchCount').textContent = 
      count + ' ' + (i18n.getMessage('selected') || 'selected');
    
    // 更新全选复选框
    const container = document.getElementById('foldersList');
    if (container) {
      const total = container.querySelectorAll('.folder-card').length;
      document.getElementById('selectAllCheckbox').checked = (count > 0 && count === total);
      document.getElementById('selectAllCheckbox').indeterminate = (count > 0 && count < total);
    }
  }

  /**
   * 批量删除
   */
  async batchDelete() {
    const ids = Array.from(this.selectedFolderIds);
    if (ids.length === 0) return;

    const message = i18n.getMessage('confirmBatchDelete').replace('$1', ids.length) || 
      `Delete ${ids.length} folders?`;

    if (this.deleteConfirm) {
      this.showConfirmModal(
        i18n.getMessage('confirmDeleteTitle') || 'Confirm Delete',
        message,
        async () => {
          await this.doBatchDelete(ids);
        }
      );
    } else {
      await this.doBatchDelete(ids);
    }
  }

  async doBatchDelete(ids) {
    // 删除前先快照所有文件夹
    const snapshots = [];
    for (const folderId of ids) {
      const folder = this.folders.find(f => f.id === folderId);
      if (!folder || folder.isRoot) continue;
      const snap = await UndoService.snapshot(folderId);
      if (snap) snapshots.push({ snap, title: folder.title });
    }

    // 执行删除
    let success = 0;
    let failed = 0;

    for (const folderId of ids) {
      try {
        const folder = this.folders.find(f => f.id === folderId);
        if (!folder || folder.isRoot) continue;

        if (folder.isEmpty) {
          await FolderOperations.deleteFolder(folderId, false, folder.isRoot);
        } else {
          await FolderOperations.deleteFolderTree(folderId, folder.isRoot);
        }
        success++;
      } catch (error) {
        failed++;
        console.error('Delete failed for ' + folderId + ':', error);
      }
    }

    // 删除图标和备注
    await FolderIconService.deleteIcons(ids);
    await NotesService.deleteNotes(ids);
    // 删除访问数据
    await FolderAccessService.clearAccessData(ids);
    // 更新本地图标和备注数据
    ids.forEach(id => {
      delete this.folderIcons[id];
    });

    // 推入撤销栈并显示 Toast
    if (snapshots.length > 0) {
      UndoService.push(
        snapshots.map(s => s.snap),
        `${snapshots.length} ` + (i18n.getMessage('foldersDeletedDesc') || 'folders')
      );
      this.showUndoToast(`${snapshots.length} ` + (i18n.getMessage('foldersDeletedDesc') || 'folders'));
    }

    if (failed > 0) {
      showNotification(`Deleted ${success}, ${failed} failed`, 'error');
    }
    this.clearSelection();
    await this.scanBookmarks();
  }

  /**
   * 显示批量颜色选择弹窗
   */
  async batchSetColor() {
    const ids = Array.from(this.selectedFolderIds);
    if (ids.length === 0) return;

    const modal = document.getElementById('batchColorModal');
    const options = document.getElementById('batchColorOptions');
    const count = document.getElementById('batchColorCount');
    const presets = FolderColorService.getPresets();

    count.textContent = ids.length;

    // 填充颜色选项（复用单文件夹颜色选择器的样式）
    options.innerHTML = presets.map(p => {
      if (p.value === '__custom__') {
        return `
          <div class="color-picker-option custom-option" data-color="__custom__">
            <span class="color-dot custom-color-dot"></span>
            <span class="color-label">${i18n.getMessage('color' + p.label) || p.label}</span>
          </div>
        `;
      }
      if (p.value === '') {
        return `
          <div class="color-picker-option no-color" data-color="">
            <span style="font-size:12px;opacity:0.5;">✕</span>
            <span class="color-label">${i18n.getMessage('color' + p.label) || p.label}</span>
          </div>
        `;
      }
      return `
        <div class="color-picker-option" data-color="${p.value}">
          <span class="color-dot" style="background:${p.hex}"></span>
          <span class="color-label">${i18n.getMessage('color' + p.label) || p.label}</span>
        </div>
      `;
    }).join('');

    // 绑定颜色选择事件
    options.querySelectorAll('.color-picker-option').forEach(opt => {
      opt.addEventListener('click', async (e) => {
        e.stopPropagation();
        const color = e.currentTarget.dataset.color;

        // 自定义颜色
        if (color === '__custom__') {
          this._customColorFolderId = '_batch_'; // 标记批量模式
          modal.classList.add('hidden');
          const colorInput = document.getElementById('customColorInput');
          colorInput.value = '#3B82F6';
          colorInput.click();
          return;
        }

        // 应用颜色到所有选中文件夹
        let success = 0;
        for (const folderId of ids) {
          try {
            await FolderColorService.setColor(folderId, color);
            success++;
          } catch (error) {
            console.error('Set color failed for ' + folderId + ':', error);
          }
        }

        this.closeBatchColorModal();

        if (success > 0) {
          showNotification(
            (i18n.getMessage('batchColorSuccess') || 'Set color for $1 folders').replace('$1', success),
            'success'
          );
          await this.scanBookmarks();
        }
      });
    });

    modal.classList.remove('hidden');
  }

  /**
   * 关闭批量颜色弹窗
   */
  closeBatchColorModal() {
    const modal = document.getElementById('batchColorModal');
    modal.classList.add('hidden');
  }

  /**
   * 显示批量添加备注弹窗
   */
  async batchAddNote() {
    const ids = Array.from(this.selectedFolderIds);
    if (ids.length === 0) return;

    const modal = document.getElementById('batchNoteModal');
    const input = document.getElementById('batchNoteInput');

    input.value = '';
    modal.classList.remove('hidden');
    input.focus();
  }

  /**
   * 关闭批量备注弹窗
   */
  closeBatchNoteModal() {
    const modal = document.getElementById('batchNoteModal');
    modal.classList.add('hidden');
  }

  /**
   * 保存批量备注
   */
  async saveBatchNote() {
    const ids = Array.from(this.selectedFolderIds);
    const note = document.getElementById('batchNoteInput').value;

    if (ids.length === 0) return;

    // 保存备注
    let success = 0;
    for (const folderId of ids) {
      try {
        await NotesService.saveNote(folderId, note);
        success++;
      } catch (error) {
        console.error('Save note failed for ' + folderId + ':', error);
      }
    }

    this.closeBatchNoteModal();

    if (success > 0) {
      showNotification(
        (i18n.getMessage('batchNoteSuccess') || 'Added note to $1 folders').replace('$1', success),
        'success'
      );
      await this.scanBookmarks();
    }
  }

  /**
   * 批量合并（合并到同一目标）
   */
  async batchMerge() {
    const ids = Array.from(this.selectedFolderIds);
    if (ids.length === 0) return;
    if (ids.length < 2) {
      showNotification(i18n.getMessage('batchMergeMin') || 'Select at least 2 folders to merge', 'info');
      return;
    }

    const targetFolders = this.folders.filter(f => !ids.includes(f.id));
    if (targetFolders.length === 0) {
      showNotification(i18n.getMessage('noTargetFolder') || 'No target folder available', 'info');
      return;
    }

    this._batchMergeIds = ids;
    const listContainer = document.getElementById('mergeFolderList');
    listContainer.innerHTML = targetFolders.map(f => `
      <div class="merge-folder-item" data-target-id="${f.id}">
        <strong>${this.escapeHtml(f.title)}</strong>
        <span style="color:var(--text-tertiary);font-size:9px;">${this.escapeHtml(f.path)}</span>
      </div>
    `).join('');

    listContainer.querySelectorAll('.merge-folder-item').forEach(item => {
      item.addEventListener('click', async () => {
        await this.executeBatchMerge(item.dataset.targetId);
      });
    });

    document.getElementById('mergeModal').classList.remove('hidden');
  }

  async executeBatchMerge(targetId) {
    this.closeMergeModal();
    const ids = this._batchMergeIds || [];
    
    let moved = 0;
    let failed = 0;
    
    for (const folderId of ids) {
      try {
        const result = await FolderOperations.moveAllBookmarks(folderId, targetId);
        await FolderOperations.deleteFolder(folderId);
        moved += result.moved;
      } catch (error) {
        failed++;
        console.error('Merge failed for ' + folderId + ':', error);
      }
    }
    
    showNotification(
      i18n.getMessage('batchMergeSuccess').replace('$1', moved) || `Moved ${moved} bookmarks`,
      'success'
    );
    
    this._batchMergeIds = null;
    this.clearSelection();
    await this.scanBookmarks();
  }

  /**
   * 批量导出
   */
  batchExport() {
    const ids = Array.from(this.selectedFolderIds);
    if (ids.length === 0) return;

    const folders = this.folders.filter(f => ids.includes(f.id));
    const data = {
      exportDate: new Date().toISOString(),
      count: folders.length,
      folders: folders.map(f => ({
        name: f.title,
        path: f.path,
        bookmarkCount: f.bookmarkCount,
        subfolderCount: f.subfolderCount
      }))
    };
    
    exportToJSON(data, 'foldermark-batch-export.json');
    showNotification(
      (i18n.getMessage('batchExportSuccess') || 'Exported $1 folders').replace('$1', folders.length),
      'success'
    );
  }

  /**
   * 保存文件夹备注
   */
  async saveFolderNote(folderId, note) {
    try {
      await NotesService.saveNote(folderId, note);
      showNotification(i18n.getMessage('noteSaved') || 'Note saved', 'success');
    } catch (error) {
      showNotification('Save note failed: ' + error.message, 'error');
    }
  }

  /**
   * 处理文件夹操作
   */
  async handleFolderAction(action, folderId) {
    try {
      switch (action) {
        case 'rename':
          await this.renameFolder(folderId);
          break;
        case 'merge':
          await this.mergeFolder(folderId);
          break;
        case 'open':
          await this.openFolder(folderId);
          break;
        case 'delete':
          await this.deleteFolder(folderId);
          break;
      }
    } catch (error) {
      console.error(`Action ${action} failed:`, error);
      showNotification(`Operation failed: ${error.message}`, 'error');
    }
  }

  /**
   * 新建文件夹
   */
  async createFolder() {
    const folderName = prompt(i18n.getMessage('newFolderPlaceholder') || 'Enter folder name:', 'New Folder');
    if (!folderName || folderName.trim() === '') return;

    try {
      await FolderOperations.createFolder(folderName.trim());
      showNotification(i18n.getMessage('folderCreated') || 'Folder created successfully', 'success');
      await this.scanBookmarks();
    } catch (error) {
      showNotification('Create failed: ' + error.message, 'error');
    }
  }

  /**
   * 重命名文件夹
   */
  async renameFolder(folderId) {
    const folder = this.folders.find(f => f.id === folderId);
    if (!folder) return;

    const newName = prompt(i18n.getMessage('rename') + ': ' + folder.title, folder.title);
    if (!newName || newName.trim() === '' || newName === folder.title) return;

    try {
      await FolderOperations.renameFolder(folderId, newName);
      showNotification('Folder renamed successfully', 'success');
      await this.scanBookmarks();
    } catch (error) {
      showNotification('Rename failed: ' + error.message, 'error');
    }
  }

  /**
   * 合并文件夹
   */
  async mergeFolder(folderId) {
    const sourceFolder = this.folders.find(f => f.id === folderId);
    if (!sourceFolder) return;

    const targetFolders = this.folders.filter(f => f.id !== folderId);
    if (targetFolders.length === 0) {
      showNotification(i18n.getMessage('noTargetFolder') || 'No target folder available', 'info');
      return;
    }

    this._mergeSourceId = folderId;
    const listContainer = document.getElementById('mergeFolderList');
    listContainer.innerHTML = targetFolders.map(f => `
      <div class="merge-folder-item" data-target-id="${f.id}">
        <strong>${this.escapeHtml(f.title)}</strong>
        <span style="color:var(--text-tertiary);font-size:9px;">${this.escapeHtml(f.path)}</span>
      </div>
    `).join('');

    listContainer.querySelectorAll('.merge-folder-item').forEach(item => {
      item.addEventListener('click', async () => {
        const targetId = item.dataset.targetId;
        await this.executeMerge(folderId, targetId);
      });
    });

    document.getElementById('mergeModal').classList.remove('hidden');
  }

  async executeMerge(sourceId, targetId) {
    this.closeMergeModal();
    const sourceFolder = this.folders.find(f => f.id === sourceId);

    if (this.deleteConfirm) {
      this.showConfirmModal(
        i18n.getMessage('confirmMerge'),
        i18n.getMessage('confirmMergeMessage').replace('$1', sourceFolder ? sourceFolder.title : '') || `Merge into target folder?`,
        async () => {
          await this.doMerge(sourceId, targetId);
        }
      );
    } else {
      await this.doMerge(sourceId, targetId);
    }
  }

  async doMerge(sourceId, targetId) {
    try {
      const result = await FolderOperations.moveAllBookmarks(sourceId, targetId);
      await FolderOperations.deleteFolder(sourceId);
      showNotification(
        i18n.getMessage('mergeSuccess').replace('$1', result.moved) || `Moved ${result.moved} bookmarks`,
        'success'
      );
      await this.scanBookmarks();
    } catch (error) {
      showNotification('Merge failed: ' + error.message, 'error');
    }
  }

  /**
   * 打开文件夹
   */
  async openFolder(folderId) {
    try {
      await FolderOperations.openFolder(folderId);
    } catch (error) {
      showNotification('Open failed: ' + error.message, 'error');
    }
  }

  /**
   * 删除文件夹（带撤销支持）
   */
  async deleteFolder(folderId) {
    const folder = this.folders.find(f => f.id === folderId);
    if (!folder) return;

    if (folder.isRoot) {
      showNotification(i18n.getMessage('cannotDeleteRoot') || 'Cannot delete system root folders', 'error');
      return;
    }

    const isEmpty = folder.isEmpty;
    const message = isEmpty
      ? i18n.getMessage('confirmDelete')
      : i18n.getMessage('confirmDeleteNonEmpty').replace('$1', folder.bookmarkCount) || `Delete folder and all ${folder.bookmarkCount} bookmarks?`;

    const doDelete = async () => {
      // 删除前快照
      const snap = await UndoService.snapshot(folderId);
      // 执行删除
      if (isEmpty) {
        await FolderOperations.deleteFolder(folderId, false, folder.isRoot);
      } else {
        await FolderOperations.deleteFolderTree(folderId, folder.isRoot);
      }
      // 删除图标和备注
      await FolderIconService.deleteIcons([folderId]);
      await NotesService.deleteNotes([folderId]);
      // 删除访问数据
      await FolderAccessService.clearAccessData([folderId]);
      // 更新本地图标数据
      delete this.folderIcons[folderId];
      // 推入撤销栈并显示 Toast
      if (snap) {
        UndoService.push([snap], folder.title);
        this.showUndoToast(folder.title);
      }
      await this.scanBookmarks();
    };

    if (this.deleteConfirm) {
      this.showConfirmModal(
        i18n.getMessage('confirmDeleteTitle') || 'Confirm Delete',
        message,
        doDelete
      );
    } else {
      try {
        await doDelete();
      } catch (error) {
        showNotification('Delete failed: ' + error.message, 'error');
      }
    }
  }

  /**
   * 渲染空文件夹列表
   */
  renderEmptyFolders() {
    const container = document.getElementById('emptyFoldersList');
    if (this.emptyFolders.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎉</div>
          <div class="empty-state-title">${i18n.getMessage('noEmptyFolders')}</div>
          <div class="empty-state-desc">${i18n.getMessage('noEmptyFoldersDesc') || 'Your bookmarks are well organized.'}</div>
        </div>`;
      return;
    }

    container.innerHTML = this.emptyFolders.map(folder => `
      <div class="folder-card" data-folder-id="${folder.id}">
        <div class="folder-header">
          <div>
            <div class="folder-name">
              <span class="folder-icon">📁</span>
              <span>${this.escapeHtml(folder.title)}</span>
            </div>
            <div class="folder-path">${this.escapeHtml(folder.path)}</div>
          </div>
        </div>
        <div class="folder-actions">
          <button class="btn btn-danger btn-sm" data-action="delete" data-folder-id="${folder.id}">${i18n.getMessage('delete')}</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('[data-action="delete"]').forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteFolder(e.target.dataset.folderId);
      });
    });
  }

  /**
   * 渲染重复文件夹列表 + 重复书签
   */
  renderDuplicates() {
    // 渲染重复文件夹
    const container = document.getElementById('duplicatesList');
    if (this.duplicates.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎉</div>
          <div class="empty-state-title">${i18n.getMessage('noDuplicates')}</div>
          <div class="empty-state-desc">${i18n.getMessage('noDuplicatesDesc') || 'Your folder structure is very tidy.'}</div>
        </div>`;
    } else {
      container.innerHTML = this.duplicates.map(group => `
        <div class="duplicate-group">
          <div class="duplicate-header">📁 ${this.escapeHtml(group.displayName)}</div>
          <div class="duplicate-count">${i18n.getMessage('duplicateCount').replace('$1', group.count) || group.count + ' duplicates'}</div>
          <div class="duplicate-folders">
            ${group.folders.map(folder => `
              <div class="duplicate-folder">
                <span>${this.escapeHtml(folder.path)} (${folder.bookmarkCount})</span>
                <button class="btn btn-secondary btn-sm" data-action="merge" data-folder-id="${folder.id}">${i18n.getMessage('merge')}</button>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('');

      container.querySelectorAll('[data-action="merge"]').forEach(button => {
        button.addEventListener('click', (e) => {
          e.stopPropagation();
          this.mergeFolder(e.target.dataset.folderId);
        });
      });
    }

    // 渲染重复书签
    this.renderDuplicateBookmarks();
  }

  /**
   * 渲染智能功能页面
   */
  renderSmartPage() {
    this.updateHealthScore();
    this.renderBrokenBookmarks();
    this.renderCleanupSuggestions();
  }
  
  /**
   * 更新健康分数
   */
  updateHealthScore() {
    if (this.folders.length === 0) return;
    
    // 计算平均健康分数
    let totalScore = 0;
    this.folders.forEach(folder => {
      totalScore += SmartCleanupSuggestions.calculateHealthScore(folder);
    });
    const avgScore = Math.round(totalScore / this.folders.length);
    
    // 更新圆圈
    const circle = document.getElementById('healthCircle');
    if (circle) {
      circle.setAttribute('stroke-dasharray', `${avgScore}, 100`);
      
      // 根据分数改变颜色
      if (avgScore >= 80) {
        circle.setAttribute('stroke', 'var(--success)');
      } else if (avgScore >= 50) {
        circle.setAttribute('stroke', 'var(--warning)');
      } else {
        circle.setAttribute('stroke', 'var(--danger)');
      }
    }
    
    // 更新分数文本
    const scoreEl = document.getElementById('healthScore');
    if (scoreEl) scoreEl.textContent = avgScore;
    
    // 更新统计
    const totalFoldersEl = document.getElementById('healthTotalFolders');
    if (totalFoldersEl) totalFoldersEl.textContent = this.folders.length;
    
    const issuesEl = document.getElementById('healthIssues');
    if (issuesEl) issuesEl.textContent = this.emptyFolders.length + this.duplicates.length;
  }
  
  /**
   * 扫描失效书签
   */
  async scanBrokenBookmarks() {
    if (this.isCheckingBroken) return;

    this.isCheckingBroken = true;
    const scanBtn = document.getElementById('scanBrokenBtn');
    const progressEl = document.getElementById('brokenCheckProgress');
    const fillEl = document.getElementById('brokenProgressFill');
    const countEl = document.getElementById('brokenProgressCount');

    scanBtn.disabled = true;
    scanBtn.textContent = i18n.getMessage('checking') || 'Checking...';
    progressEl.classList.remove('hidden');

    try {
      // 收集所有书签
      const bookmarkTree = await this.getBookmarkTree();
      const allBookmarks = BrokenBookmarkDetector.collectAllBookmarks(bookmarkTree);

      if (allBookmarks.length === 0) {
        showNotification('No bookmarks to check', 'info');
        this.isCheckingBroken = false;
        scanBtn.disabled = false;
        scanBtn.textContent = i18n.getMessage('scanBroken') || 'Scan';
        progressEl.classList.add('hidden');
        return;
      }

      this.brokenBookmarks = [];
      const total = allBookmarks.length;
      let completed = 0;

      const result = await BrokenBookmarkDetector.checkAllBookmarks(
        allBookmarks,
        (current, totalCount, itemResult) => {
          completed = current;
          if (fillEl) fillEl.style.width = `${Math.round((current / totalCount) * 100)}%`;
          if (countEl) countEl.textContent = `${current} / ${totalCount}`;
        },
        5
      );

      this.brokenBookmarks = result.broken;

      // 更新统计卡片中的书签总数（可选）
      this.renderBrokenBookmarks();

      showNotification(
        `Scan complete: ${result.broken.length} broken, ${result.valid.length} valid`,
        result.broken.length > 0 ? 'warning' : 'success'
      );
    } catch (error) {
      console.error('Scan broken bookmarks failed:', error);
      showNotification('Scan failed: ' + error.message, 'error');
    } finally {
      this.isCheckingBroken = false;
      scanBtn.disabled = false;
      scanBtn.textContent = i18n.getMessage('scanBroken') || 'Scan';
      progressEl.classList.add('hidden');
    }
  }

  /**
   * 渲染失效书签列表
   */
  renderBrokenBookmarks() {
    const container = document.getElementById('brokenBookmarksList');
    const actionsEl = document.getElementById('brokenBookmarksActions');

    if (this.brokenBookmarks.length === 0) {
      container.innerHTML = `
        <div class="empty-state" id="brokenBookmarksEmpty">
          <div class="empty-state-icon">✅</div>
          <div class="empty-state-title">${i18n.getMessage('noBrokenBookmarksFound') || 'No broken bookmarks!'}</div>
          <div class="empty-state-desc">${i18n.getMessage('noBrokenBookmarksFoundDesc') || 'All your bookmarks are accessible.'}</div>
        </div>`;
      actionsEl.classList.add('hidden');
      return;
    }

    actionsEl.classList.remove('hidden');
    container.innerHTML = this.brokenBookmarks.map((bookmark, index) => `
      <div class="broken-bookmark-item">
        <div class="broken-bookmark-info">
          <span class="broken-bookmark-title">${this.escapeHtml(bookmark.title)}</span>
          <span class="broken-bookmark-url">${this.escapeHtml(bookmark.url)}</span>
        </div>
        <span class="broken-bookmark-status ${bookmark.status}">${this.getBrokenStatusText(bookmark.status)}</span>
        <button class="btn btn-danger btn-sm" data-action="delete-broken" data-bookmark-id="${bookmark.id}" title="${i18n.getMessage('delete')}">×</button>
      </div>
    `).join('');

    // 绑定删除按钮事件
    container.querySelectorAll('[data-action="delete-broken"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.dataset.bookmarkId;
        await this.deleteBrokenBookmark(id);
      });
    });
  }

  /**
   * 获取失效状态文本
   */
  getBrokenStatusText(status) {
    const map = {
      'timeout': i18n.getMessage('statusTimeout') || 'Timeout',
      'unreachable': i18n.getMessage('statusUnreachable') || 'Unreachable',
      'unknown': i18n.getMessage('statusUnknown') || 'Unknown'
    };
    return map[status] || status;
  }

  /**
   * 删除单个失效书签
   */
  async deleteBrokenBookmark(bookmarkId) {
    try {
      await new Promise((resolve, reject) => {
        chrome.bookmarks.remove(bookmarkId, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      });

      this.brokenBookmarks = this.brokenBookmarks.filter(b => b.id !== bookmarkId);
      this.renderBrokenBookmarks();
      showNotification('Bookmark deleted', 'success');
    } catch (error) {
      showNotification('Delete failed: ' + error.message, 'error');
    }
  }

  /**
   * 清理所有失效书签
   */
  async cleanBrokenBookmarks() {
    if (this.brokenBookmarks.length === 0) {
      showNotification('No broken bookmarks to clean', 'info');
      return;
    }

    if (this.deleteConfirm) {
      this.showConfirmModal(
        i18n.getMessage('confirmCleanBroken') || 'Delete Broken Bookmarks',
        (i18n.getMessage('confirmCleanBrokenMessage') || `Delete ${this.brokenBookmarks.length} broken bookmarks?`).replace('$1', this.brokenBookmarks.length),
        async () => {
          await this.doCleanBrokenBookmarks();
        }
      );
    } else {
      await this.doCleanBrokenBookmarks();
    }
  }

  async doCleanBrokenBookmarks() {
    try {
      const result = await BrokenBookmarkDetector.removeBrokenBookmarks(this.brokenBookmarks);
      showNotification(
        `Deleted ${result.success} broken bookmarks${result.failed > 0 ? ', ' + result.failed + ' failed' : ''}`,
        'success'
      );
      if (result.errors.length > 0) {
        console.error('Clean broken errors:', result.errors);
      }
      this.brokenBookmarks = [];
      this.renderBrokenBookmarks();
      await this.scanBookmarks();
    } catch (error) {
      showNotification('Clean failed: ' + error.message, 'error');
    }
  }

  /**
   * 渲染重复书签列表
   */
  renderDuplicateBookmarks() {
    const container = document.getElementById('duplicateBookmarksList');
    
    if (this.duplicateBookmarks.length === 0) {
      container.innerHTML = `
        <div class="empty-state" id="duplicateBookmarksEmpty">
          <div class="empty-state-icon">🎉</div>
          <div class="empty-state-title">${i18n.getMessage('noDuplicateBookmarks')}</div>
          <div class="empty-state-desc">${i18n.getMessage('noDuplicateBookmarksDesc') || 'All your bookmarks are unique.'}</div>
        </div>`;
      return;
    }
    
    // 为每个重复组生成唯一 ID（用于 radio 分组）
    container.innerHTML = this.duplicateBookmarks.map((group, index) => `
      <div class="duplicate-bookmark-group">
        <div class="duplicate-bookmark-header">
          <span class="duplicate-bookmark-url">${this.escapeHtml(group.url)}</span>
          <span class="duplicate-bookmark-count">${(i18n.getMessage('duplicateCount') || '$1 duplicates').replace('$1', group.count)}</span>
        </div>
        <div class="duplicate-bookmark-list">
          ${group.bookmarks.map((bookmark, idx) => `
            <div class="duplicate-bookmark-item">
              <label class="duplicate-bookmark-radio">
                <input type="radio" name="keep-${index}" value="${idx}" ${idx === 0 ? 'checked' : ''} data-group-index="${index}" data-bookmark-index="${idx}">
                <span class="radio-label">${idx === 0 ? (i18n.getMessage('keepDefault') || 'Keep (default)') : i18n.getMessage('deleteThis') || 'Delete this'}</span>
              </label>
              <div class="duplicate-bookmark-info">
                <span class="duplicate-bookmark-title">${this.escapeHtml(bookmark.title)}</span>
                <span class="duplicate-bookmark-path">${this.escapeHtml(bookmark.path)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    // 绑定 radio 切换事件
    container.querySelectorAll('input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', () => {
        // 更新 UI 显示
        const groupIndex = parseInt(radio.dataset.groupIndex);
        const bookmarkIndex = parseInt(radio.dataset.bookmarkIndex);
        this.updateKeepBadge(groupIndex, bookmarkIndex);
      });
    });
  }

  /**
   * 更新保留标记显示
   */
  updateKeepBadge(groupIndex, keepIndex) {
    const container = document.getElementById('duplicateBookmarksList');
    const groupEl = container.querySelectorAll('.duplicate-bookmark-group')[groupIndex];
    if (!groupEl) return;

    groupEl.querySelectorAll('.duplicate-bookmark-item').forEach((item, idx) => {
      const badge = item.querySelector('.keep-badge');
      if (idx === keepIndex) {
        if (!badge) {
          const badgeEl = document.createElement('span');
          badgeEl.className = 'keep-badge';
          badgeEl.textContent = i18n.getMessage('keep') || 'Keep';
          item.appendChild(badgeEl);
        }
      } else {
        if (badge) badge.remove();
      }
    });
  }
  
  /**
   * 渲染清理建议
   */
  renderCleanupSuggestions() {
    const container = document.getElementById('cleanupSuggestionsList');
    
    if (this.cleanupSuggestions.length === 0) {
      container.innerHTML = `
        <div class="empty-state" id="cleanupSuggestionsEmpty">
          <div class="empty-state-icon">✨</div>
          <div class="empty-state-title">${i18n.getMessage('noSuggestions')}</div>
          <div class="empty-state-desc">${i18n.getMessage('noSuggestionsDesc') || 'Your bookmarks are well organized.'}</div>
        </div>`;
      return;
    }
    
    container.innerHTML = this.cleanupSuggestions.map((suggestion, index) => `
      <div class="cleanup-suggestion-group priority-${suggestion.priority}">
        <div class="cleanup-suggestion-header">
          <span class="cleanup-suggestion-title">${i18n.getMessage(suggestion.type + 'Title') || suggestion.title}</span>
          <span class="cleanup-suggestion-count">${suggestion.count}</span>
        </div>
        <div class="cleanup-suggestion-desc">${i18n.getMessage(suggestion.type + 'Desc') || suggestion.description}</div>
        <div class="cleanup-suggestion-folders">
          ${suggestion.folders.slice(0, 5).map(folder => `
            <div class="cleanup-suggestion-folder">
              <span class="folder-name">${this.escapeHtml(folder.title)}</span>
              <span class="folder-path">${this.escapeHtml(folder.path)}</span>
            </div>
          `).join('')}
          ${suggestion.folders.length > 5 ? `<div class="more-items">+${suggestion.folders.length - 5} ${i18n.getMessage('more') || 'more'}</div>` : ''}
        </div>
        <div class="cleanup-suggestion-actions">
          <button class="btn btn-sm ${suggestion.priority === 'high' ? 'btn-danger' : 'btn-secondary'}" 
                  data-action="smart-action" data-suggestion-index="${index}">
            ${this.getSuggestionButtonText(suggestion.type)}
          </button>
        </div>
      </div>
    `).join('');

    // 绑定按钮事件
    container.querySelectorAll('[data-action="smart-action"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.suggestionIndex);
        this.executeSuggestionAction(this.cleanupSuggestions[index]);
      });
    });
  }
  
  /**
   * 获取建议按钮文本
   */
  getSuggestionButtonText(type) {
    const texts = {
      'empty': i18n.getMessage('deleteAll') || 'Delete All',
      'unused': i18n.getMessage('review') || 'Review',
      'small': i18n.getMessage('merge') || 'Merge',
      'duplicates': i18n.getMessage('mergeAll') || 'Merge All'
    };
    return texts[type] || i18n.getMessage('fix') || 'Fix';
  }

  /**
   * 执行建议操作
   */
  async executeSuggestionAction(suggestion) {
    switch (suggestion.type) {
      case 'empty':
        await this.cleanAllEmptyFolders();
        break;
      case 'unused':
      case 'small':
      case 'duplicates':
        // 选中相关文件夹并切换到 Folders Tab
        this.selectedFolderIds.clear();
        suggestion.folders.forEach(f => this.selectedFolderIds.add(f.id));
        this.switchTab(TABS.FOLDERS);
        showNotification(
          i18n.getMessage('foldersSelected').replace('$1', suggestion.folders.length) || 
          `${suggestion.folders.length} folders selected. Use batch operations to manage them.`,
          'info'
        );
        break;
    }
  }

  /**
   * 清理重复书签
   */
  async cleanDuplicateBookmarks() {
    if (this.duplicateBookmarks.length === 0) {
      showNotification('No duplicate bookmarks to clean', 'info');
      return;
    }
    
    if (this.deleteConfirm) {
      this.showConfirmModal(
        i18n.getMessage('confirmCleanDuplicates') || 'Clean Duplicate Bookmarks',
        i18n.getMessage('confirmCleanDuplicatesMessage') || `Delete ${this.duplicateBookmarks.reduce((sum, g) => sum + g.count - 1, 0)} duplicate bookmarks?`,
        async () => {
          await this.doCleanDuplicateBookmarks();
        }
      );
    } else {
      await this.doCleanDuplicateBookmarks();
    }
  }
  
  async doCleanDuplicateBookmarks() {
    try {
      // 收集用户选择的保留索引
      const keepIndices = [];
      const container = document.getElementById('duplicateBookmarksList');
      
      this.duplicateBookmarks.forEach((group, groupIndex) => {
        // 查找该组中选中的 radio
        const radios = container.querySelectorAll(`input[name="keep-${groupIndex}"]`);
        let keepIndex = 0; // 默认保留第一个
        radios.forEach(radio => {
          if (radio.checked) {
            keepIndex = parseInt(radio.value);
          }
        });
        keepIndices.push(keepIndex);
      });

      // 按用户选择清理重复书签
      let totalSuccess = 0;
      let totalFailed = 0;
      
      for (let i = 0; i < this.duplicateBookmarks.length; i++) {
        const group = this.duplicateBookmarks[i];
        const keepIndex = keepIndices[i];
        
        const result = await DuplicateBookmarkDetector.removeDuplicates([group], keepIndex);
        totalSuccess += result.success;
        totalFailed += result.failed;
        
        if (result.errors.length > 0) {
          console.error('Clean duplicates errors:', result.errors);
        }
      }
      
      showNotification(
        `Deleted ${totalSuccess} duplicate bookmarks${totalFailed > 0 ? ', ' + totalFailed + ' failed' : ''}`,
        'success'
      );
      
      await this.scanBookmarks();
    } catch (error) {
      showNotification('Clean failed: ' + error.message, 'error');
    }
  }

  /**
   * 渲染设置页面
   */
  renderSettings() {
    const themeSelect = document.getElementById('themeSelect');
    themeSelect.value = this.theme;
    const languageSelect = document.getElementById('languageSelect');
    languageSelect.value = this.language;
    const deleteConfirmToggle = document.getElementById('deleteConfirmToggle');
    deleteConfirmToggle.checked = this.deleteConfirm;
  }

  /**
   * 更新统计信息
   */
  updateStats() {
    document.getElementById('totalFolders').textContent = this.folders.length;
    document.getElementById('totalBookmarks').textContent = this.folders.reduce((sum, f) => sum + f.bookmarkCount, 0);
    document.getElementById('emptyFolders').textContent = this.emptyFolders.length;
    document.getElementById('duplicateFolders').textContent = this.duplicates.length;
  }

  /**
   * 清理所有空文件夹
   */
  async cleanAllEmptyFolders() {
    if (this.emptyFolders.length === 0) {
      showNotification('No empty folders to clean', 'info');
      return;
    }

    if (this.deleteConfirm) {
      this.showConfirmModal(
        i18n.getMessage('confirmDeleteAll'),
        i18n.getMessage('confirmDeleteAllMessage').replace('$1', this.emptyFolders.length) || `Delete all ${this.emptyFolders.length} empty folders?`,
        async () => {
          await this.doCleanAllEmpty();
        }
      );
    } else {
      await this.doCleanAllEmpty();
    }
  }

  async doCleanAllEmpty() {
    try {
      // 删除前先快照所有空文件夹
      const snapshots = [];
      for (const folder of this.emptyFolders) {
        const snap = await UndoService.snapshot(folder.id);
        if (snap) snapshots.push(snap);
      }

      const results = await EmptyFolderDetector.deleteAllEmptyFolders(this.emptyFolders);
      showNotification(`Deleted ${results.success} folders, ${results.failed} failed`, 'success');
      if (results.errors.length > 0) {
        console.error('Delete errors:', results.errors);
      }

      // 推入撤销栈并显示 Toast
      if (snapshots.length > 0) {
        UndoService.push(
          snapshots,
          `${snapshots.length} ` + (i18n.getMessage('foldersDeletedDesc') || 'folders')
        );
        this.showUndoToast(`${snapshots.length} ` + (i18n.getMessage('foldersDeletedDesc') || 'folders'));
      }

      await this.scanBookmarks();
    } catch (error) {
      showNotification('Clean failed: ' + error.message, 'error');
    }
  }

  /**
   * 显示确认弹窗
   */
  showConfirmModal(title, message, confirmCallback) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalMessage').textContent = message;
    document.getElementById('confirmModal').classList.remove('hidden');
    this.confirmCallback = confirmCallback;
  }

  closeModal() {
    document.getElementById('confirmModal').classList.add('hidden');
    this.confirmCallback = null;
  }

  executeConfirmAction() {
    if (this.confirmCallback) {
      this.confirmCallback();
      this.closeModal();
    }
  }

  /**
   * 显示撤销 Toast
   * @param {string} description - 已删除的内容描述
   */
  showUndoToast(description) {
    const text = document.getElementById('undoToastText');
    const msg = (i18n.getMessage('folderDeleted') || '$1 deleted').replace('$1', description);
    text.textContent = msg;
    document.getElementById('undoToast').classList.remove('hidden');

    // 5 秒后自动关闭
    if (this._undoToastTimer) clearTimeout(this._undoToastTimer);
    this._undoToastTimer = setTimeout(() => this.hideUndoToast(), 5000);
  }

  /**
   * 隐藏撤销 Toast
   */
  hideUndoToast() {
    document.getElementById('undoToast').classList.add('hidden');
    if (this._undoToastTimer) {
      clearTimeout(this._undoToastTimer);
      this._undoToastTimer = null;
    }
  }

  /**
   * 执行撤销操作
   */
  async executeUndo() {
    this.hideUndoToast();
    try {
      const result = await UndoService.undo();
      if (result.restored > 0) {
        showNotification(
          (i18n.getMessage('undoSuccess') || 'Restored $1 folders').replace('$1', result.restored),
          'success'
        );
      }
      if (result.failed > 0) {
        showNotification(
          (i18n.getMessage('undoFailed') || '$1 folders could not be restored (parent deleted)').replace('$1', result.failed),
          'error'
        );
      }
      await this.scanBookmarks();
    } catch (error) {
      showNotification('Undo failed: ' + error.message, 'error');
    }
  }

  closeMergeModal() {
    document.getElementById('mergeModal').classList.add('hidden');
    this._mergeSourceId = null;
  }

  /**
   * 切换主题
   */
  async toggleTheme() {
    const newTheme = this.theme === 'dark' ? 'light' : 'dark';
    await this.changeTheme(newTheme);
  }

  async changeTheme(themeName) {
    this.theme = themeName;
    await theme.setTheme(themeName);
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) themeSelect.value = themeName;
    await chrome.storage.local.set({ [STORAGE_KEYS.THEME]: themeName });
  }

  async changeLanguage(language) {
    this.language = language;
    await i18n.setLanguage(language);
    await chrome.storage.local.set({ [STORAGE_KEYS.LANGUAGE]: language });
    this.renderCurrentPage();
  }

  async toggleDeleteConfirm(enabled) {
    this.deleteConfirm = enabled;
    await chrome.storage.local.set({ [STORAGE_KEYS.DELETE_CONFIRM]: enabled });
  }

  /**
   * 导出配置（颜色、图标、备注、设置等）
   */
  async exportStructure() {
    try {
      // 收集所有配置数据
      const colors = await FolderColorService.loadColors();
      const icons = await FolderIconService.loadIcons();
      const notes = await NotesService.loadNotes();
      const settings = {
        theme: this.theme,
        language: this.language,
        deleteConfirm: this.deleteConfirm
      };

      const data = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        colors: colors,
        icons: icons,
        notes: notes,
        settings: settings
      };

      // 导出为 JSON 文件
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `foldermark-config-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();

      URL.revokeObjectURL(url);

      showNotification(
        i18n.getMessage('exportSuccess') || 'Configuration exported successfully',
        'success'
      );
    } catch (error) {
      console.error('Export failed:', error);
      showNotification(
        (i18n.getMessage('exportFailed') || 'Export failed') + ': ' + error.message,
        'error'
      );
    }
  }

  /**
   * 导入配置（颜色、备注、设置等）
   */
  importStructure() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = JSON.parse(event.target.result);

          // 验证文件格式
          if (!data.version || !data.colors) {
            showNotification(
              i18n.getMessage('importInvalidFormat') || 'Invalid file format',
              'error'
            );
            return;
          }

          // 导入颜色
          if (data.colors) {
            for (const [folderId, color] of Object.entries(data.colors)) {
              await FolderColorService.setColor(folderId, color);
            }
          }

          // 导入图标
          if (data.icons) {
            for (const [folderId, icon] of Object.entries(data.icons)) {
              await FolderIconService.setIcon(folderId, icon);
            }
          }

          // 导入备注
          if (data.notes) {
            for (const [folderId, note] of Object.entries(data.notes)) {
              await NotesService.saveNote(folderId, note);
            }
          }

          // 导入设置
          if (data.settings) {
            if (data.settings.theme) {
              await theme.setTheme(data.settings.theme);
              this.theme = data.settings.theme;
              const themeSelect = document.getElementById('themeSelect');
              if (themeSelect) themeSelect.value = this.theme;
            }
            if (data.settings.language) {
              this.language = data.settings.language;
              await i18n.init(this.language);
              const languageSelect = document.getElementById('languageSelect');
              if (languageSelect) languageSelect.value = this.language;
            }
            if (data.settings.deleteConfirm !== undefined) {
              this.deleteConfirm = data.settings.deleteConfirm;
              const deleteConfirmToggle = document.getElementById('deleteConfirmToggle');
              if (deleteConfirmToggle) deleteConfirmToggle.checked = this.deleteConfirm;
            }
          }

          showNotification(
            i18n.getMessage('importSuccess') || 'Configuration imported successfully',
            'success'
          );

          // 刷新界面
          await this.scanBookmarks();
        } catch (error) {
          console.error('Import failed:', error);
          showNotification(
            (i18n.getMessage('importFailed') || 'Import failed') + ': ' + error.message,
            'error'
          );
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  async restoreDefaults() {
    if (this.deleteConfirm) {
      this.showConfirmModal(
        i18n.getMessage('confirmRestore') || 'Restore default settings?',
        'This will reset all settings to their default values.',
        async () => {
          await this.doRestoreDefaults();
        }
      );
    } else {
      await this.doRestoreDefaults();
    }
  }

  async doRestoreDefaults() {
    try {
      const defaultSettings = {
        [STORAGE_KEYS.THEME]: 'system',
        [STORAGE_KEYS.LANGUAGE]: 'en',
        [STORAGE_KEYS.DELETE_CONFIRM]: true
      };
      await chrome.storage.local.set(defaultSettings);
      this.theme = 'system';
      this.language = 'en';
      this.deleteConfirm = true;
      await theme.setTheme('system');
      await i18n.setLanguage('en');
      this.renderSettings();
      showNotification(i18n.getMessage('restoreSuccess') || 'Settings restored to defaults', 'success');
    } catch (error) {
      showNotification('Restore failed: ' + error.message, 'error');
    }
  }

  showPrivacyInfo() {
    alert(i18n.getMessage('privacyMessage'));
  }

  /**
   * 显示/隐藏加载状态
   */
  showLoading(show) {
    const loading = document.getElementById('foldersLoading');
    if (loading) {
      loading.style.display = show ? 'flex' : 'none';
    }
  }

  /**
   * 转义 HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

const app = new App();
