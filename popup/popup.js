/**
 * FolderMark - Popup Main Logic
 * 主交互逻辑
 */

import i18n from '../src/utils/i18n.js';
import theme from '../src/ui/theme.js';
import ModalService from '../src/ui/modalService.js';
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
import BookmarkMover from '../src/features/bookmarkMover.js';
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
    this._brokenScanTimer = null; // 后台扫描轮询定时器
    this._isScanningBroken = false; // 失效书签扫描进行中标志
    this.folderColors = {}; // 文件夹颜色 {folderId: colorValue}
    this.folderIcons = {}; // 文件夹图标 {folderId: iconValue}
    this.colorFilter = ''; // 当前颜色筛选
    this.actionPosition = 'right'; // 操作按钮位置: left | right
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
    this._lastSelectedFolderIndex = -1; // Shift 多选：上次点击的文件夹索引
    this.folderPageSize = 50; // 分页：每页显示数
    this.folderRenderedCount = 50; // 分页：当前已渲染数
    this._hasScanned = false; // 是否已扫描过书签（用于 empty state 区分未扫描/首次进入）
    this.hideRootFolders = false; // 是否隐藏根文件夹
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
      
      // 初始化撤销服务（加载历史）
      await UndoService.init();
      
      this.bindEvents();

      // 加载颜色和图标
      this.folderColors = await FolderColorService.loadColors();
      this.folderIcons = await FolderIconService.loadIcons();

      await this.scanBookmarks();

      // 检查是否有待保存的页面（从右键菜单触发）
      await this.checkPendingSave();
      
      // 渲染撤销历史
      this.renderUndoHistory();

      // 恢复可能正在后台进行的失效书签扫描
      await this.restoreBrokenScanState();
    } catch (error) {
      console.error('Initialization failed:', error);
      showNotification((i18n.getMessage('initializationFailed') || 'Initialization failed: $1').replace('$1', error.message), 'error');
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
  async showSaveToFolderDialog(pageInfo) {
    const choice = await this.showPromptModal({
      title: i18n.getMessage('savePageConfirm') || 'Save page to bookmarks?',
      message: `${pageInfo.title}\n\n${i18n.getMessage('selectFolder') || 'Select folder (or cancel to save to bookmark bar):'}`,
      defaultValue: this.folders.length > 0 ? this.folders[0].title : ''
    });

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
            showNotification((i18n.getMessage('saveFailed') || 'Save failed: $1').replace('$1', err.message), 'error');
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
        showNotification((i18n.getMessage('saveFailed') || 'Save failed: $1').replace('$1', err.message), 'error');
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
        STORAGE_KEYS.DELETE_CONFIRM,
        STORAGE_KEYS.HIDE_ROOT_FOLDERS,
        STORAGE_KEYS.ACTION_POSITION
      ], (result) => {
        this.theme = result[STORAGE_KEYS.THEME] || 'light';
        this.language = result[STORAGE_KEYS.LANGUAGE] || 'en';
        this.deleteConfirm = result[STORAGE_KEYS.DELETE_CONFIRM] !== false;
        this.hideRootFolders = result[STORAGE_KEYS.HIDE_ROOT_FOLDERS] === true;
        this.actionPosition = result[STORAGE_KEYS.ACTION_POSITION] || 'right';
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
      // 显示/隐藏清空按钮
      const clearBtn = document.getElementById('searchClearBtn');
      if (clearBtn) {
        clearBtn.classList.toggle('visible', !!e.target.value);
      }
    }, 300));

    // 搜索清空按钮
    const searchClearBtn = document.getElementById('searchClearBtn');
    if (searchClearBtn) {
      searchClearBtn.addEventListener('click', () => {
        const input = document.getElementById('searchInput');
        if (input) {
          input.value = '';
          this.searchQuery = '';
          this.renderFolders();
          searchClearBtn.classList.remove('visible');
          input.focus();
        }
      });
    }

    // Esc 清空搜索
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        this.searchQuery = '';
        this.renderFolders();
        const clearBtn = document.getElementById('searchClearBtn');
        if (clearBtn) clearBtn.classList.remove('visible');
      }
    });

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

    // 设置 - 隐藏根文件夹
    const hideRootFoldersToggle = document.getElementById('hideRootFoldersToggle');
    if (hideRootFoldersToggle) {
      hideRootFoldersToggle.checked = this.hideRootFolders;
      hideRootFoldersToggle.addEventListener('change', (e) => {
        this.toggleHideRootFolders(e.target.checked);
      });
    }

    // 设置 - 操作按钮位置
    const actionPositionSelect = document.getElementById('actionPositionSelect');
    if (actionPositionSelect) {
      actionPositionSelect.value = this.actionPosition;
      actionPositionSelect.addEventListener('change', (e) => {
        this.actionPosition = e.target.value;
        chrome.storage.local.set({ [STORAGE_KEYS.ACTION_POSITION]: this.actionPosition });
        this.renderFolders();
      });
    }

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

    // 设置 - 清空撤销历史
    const clearUndoHistoryBtn = document.getElementById('clearUndoHistory');
    if (clearUndoHistoryBtn) {
      clearUndoHistoryBtn.addEventListener('click', () => {
        UndoService.clearHistory();
        this.renderUndoHistory();
        showNotification(i18n.getMessage('historyCleared') || 'History cleared', 'success');
      });
    }

    // 设置 - 重新扫描书签
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

    ModalService.bind(this);

    const wechatQrImg = document.getElementById('wechatQrImg');
    if (wechatQrImg) {
      wechatQrImg.addEventListener('error', () => {
        wechatQrImg.style.display = 'none';
        const placeholder = wechatQrImg.nextElementSibling;
        if (placeholder) placeholder.style.display = 'block';
      });
    }

    // 合并弹窗
    document.getElementById('mergeCancel').addEventListener('click', () => {
      this.closeMergeModal();
    });
    document.getElementById('mergeModal').addEventListener('click', (e) => {
      if (e.target.classList.contains('merge-modal-overlay')) {
        this.closeMergeModal();
      }
    });

    // 书签移动弹窗
    document.getElementById('moveCancel').addEventListener('click', () => {
      this.closeMoveModal();
    });
    document.getElementById('moveModal').addEventListener('click', (e) => {
      if (e.target.classList.contains('merge-modal-overlay')) {
        this.closeMoveModal();
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
    // 清空检测结果
    const clearBrokenBtn = document.getElementById('clearBrokenBtn');
    if (clearBrokenBtn) {
      clearBrokenBtn.addEventListener('click', () => {
        this.clearBrokenResults();
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

    // 颜色筛选 - 自定义下拉交互
    const colorFilterSelect = document.getElementById('colorFilterSelect');
    if (colorFilterSelect) {
      const trigger = colorFilterSelect.querySelector('.custom-select-trigger');
      const dropdown = colorFilterSelect.querySelector('.custom-select-dropdown');

      // 点击 trigger → toggle 下拉
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !dropdown.classList.contains('hidden');
        // 先关闭所有其他自定义下拉
        document.querySelectorAll('.custom-select-dropdown:not(.hidden)').forEach(d => d.classList.add('hidden'));
        if (isOpen) {
          dropdown.classList.add('hidden');
        } else {
          dropdown.classList.remove('hidden');
        }
      });

      // 点击外部 → 关闭下拉
      document.addEventListener('click', (e) => {
        if (!colorFilterSelect.contains(e.target)) {
          dropdown.classList.add('hidden');
        }
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
        this.updateColorFilterOptions();
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

    // 赞赏支持 - 弹窗
    const donateWechatBtn = document.getElementById('donateWechatBtn');
    const donatePaypalBtn = document.getElementById('donatePaypalBtn');
    const donateWechatModal = document.getElementById('donateWechatModal');
    const donatePaypalModal = document.getElementById('donatePaypalModal');

    if (donateWechatBtn && donateWechatModal) {
      donateWechatBtn.addEventListener('click', () => {
        donateWechatModal.classList.remove('hidden');
      });
      document.getElementById('donateWechatClose')?.addEventListener('click', () => {
        donateWechatModal.classList.add('hidden');
      });
      donateWechatModal.querySelector('.modal-overlay')?.addEventListener('click', () => {
        donateWechatModal.classList.add('hidden');
      });
    }

    if (donatePaypalBtn && donatePaypalModal) {
      donatePaypalBtn.addEventListener('click', () => {
        donatePaypalModal.classList.remove('hidden');
      });
      document.getElementById('donatePaypalClose')?.addEventListener('click', () => {
        donatePaypalModal.classList.add('hidden');
      });
      donatePaypalModal.querySelector('.modal-overlay')?.addEventListener('click', () => {
        donatePaypalModal.classList.add('hidden');
      });
    }

    // 问题反馈入口
    const feedbackBtn = document.getElementById('feedbackBtn');
    if (feedbackBtn) {
      feedbackBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'mailto:huangzero2004@gmail.com?subject=' + encodeURIComponent('FolderMark 问题反馈') });
      });
    }

    // 空状态 - 开始扫描失效书签
    const emptyStateScanBroken = document.getElementById('emptyStateScanBroken');
    if (emptyStateScanBroken) {
      emptyStateScanBroken.addEventListener('click', () => {
        this.switchTab('smart');
        setTimeout(() => {
          const scanBtn = document.getElementById('scanBrokenBtn');
          if (scanBtn) scanBtn.click();
        }, 100);
      });
    }

    // 空状态 - 运行清理分析
    const emptyStateRunAnalysis = document.getElementById('emptyStateRunAnalysis');
    if (emptyStateRunAnalysis) {
      emptyStateRunAnalysis.addEventListener('click', () => {
        this.switchTab('smart');
        // 触发清理建议
        if (this._runCleanupSuggestions) {
          this._runCleanupSuggestions();
        }
      });
    }
  }

  /**
   * 快捷键处理
   */
  handleKeyboard(e) {
    // 忽略在输入框中的按键（除了特定快捷键）
    const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT';

    switch (e.key) {
      case 'ArrowUp':
        if (!inInput) {
          e.preventDefault();
          this._moveFocus(-1);
        }
        break;
      case 'ArrowDown':
        if (!inInput) {
          e.preventDefault();
          this._moveFocus(1);
        }
        break;
      case 'Enter':
        if (!inInput && this._focusedFolderIndex >= 0) {
          e.preventDefault();
          this._activateFocused();
        }
        break;
      case ' ':
        if (!inInput && this._focusedFolderIndex >= 0) {
          e.preventDefault();
          this._toggleFocusedSelection();
        }
        break;
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
        } else if (!document.getElementById('moveModal').classList.contains('hidden')) {
          this.closeMoveModal();
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
          const tabs = ['folders', 'duplicates', 'smart', 'settings'];
          const tabIndex = parseInt(e.key) - 1;
          if (tabIndex < tabs.length) {
            this.switchTab(tabs[tabIndex]);
          }
        }
        break;
    }
  }

  /**
   * 移动键盘焦点
   * @param {number} direction - 方向：+1 向下，-1 向上
   */
  _moveFocus(direction) {
    if (this.currentTab !== TABS.FOLDERS) return;
    const cards = Array.from(document.querySelectorAll('.folder-card'));
    if (cards.length === 0) return;

    // 移除旧焦点
    cards.forEach(c => {
      c.classList.remove('focused');
      c.setAttribute('tabindex', '-1');
    });

    // 计算新焦点索引
    if (this._focusedFolderIndex < 0) {
      this._focusedFolderIndex = direction > 0 ? 0 : cards.length - 1;
    } else {
      this._focusedFolderIndex = (this._focusedFolderIndex + direction + cards.length) % cards.length;
    }

    // 应用新焦点
    const card = cards[this._focusedFolderIndex];
    if (card) {
      card.classList.add('focused');
      card.setAttribute('tabindex', '0');
      card.focus();
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  /**
   * 激活当前焦点文件夹（展开/收起）
   */
  _activateFocused() {
    if (this._focusedFolderIndex < 0) return;
    const cards = Array.from(document.querySelectorAll('.folder-card'));
    if (this._focusedFolderIndex >= cards.length) return;

    const card = cards[this._focusedFolderIndex];
    const folderId = card.dataset.folderId;
    if (folderId) {
      this.toggleExpand(folderId);
    }
  }

  /**
   * 切换当前焦点文件夹的选中状态
   */
  _toggleFocusedSelection() {
    if (this._focusedFolderIndex < 0) return;
    const cards = Array.from(document.querySelectorAll('.folder-card'));
    if (this._focusedFolderIndex >= cards.length) return;

    const card = cards[this._focusedFolderIndex];
    const folderId = card.dataset.folderId;
    if (folderId) {
      const cb = card.querySelector('input[type="checkbox"]');
      if (cb) {
        cb.checked = !cb.checked;
        this.toggleFolderSelection(folderId, cb.checked);
        // 视觉反馈
        if (cb.checked) {
          card.classList.add('selected');
        } else {
          card.classList.remove('selected');
        }
      }
    }
  }

  /**
   * 根据当前文件夹列表，动态更新颜色筛选下拉选项
   * 只显示实际存在的颜色（预设 + 自定义 hex）
   * 使用自定义下拉组件（非原生 select）
   */
  updateColorFilterOptions() {
    const container = document.getElementById('colorFilterSelect');
    if (!container) return;

    const dropdown = container.querySelector('.custom-select-dropdown');
    if (!dropdown) return;

    // 保存当前选中值
    const currentValue = this.colorFilter;

    // 收集所有实际存在的颜色值
    const colorSet = new Set();
    this.folders.forEach(f => {
      if (f._color) colorSet.add(f._color);
    });

    // 预设颜色（按常见顺序，带 hex 值用于 CSS 圆点）
    const presetList = [
      { value: 'red',    hex: '#EF4444', zh: '红色',   en: 'Red' },
      { value: 'orange', hex: '#F97316', zh: '橙色',   en: 'Orange' },
      { value: 'yellow', hex: '#EAB308', zh: '黄色',   en: 'Yellow' },
      { value: 'green',  hex: '#22C55E', zh: '绿色',   en: 'Green' },
      { value: 'blue',   hex: '#3B82F6', zh: '蓝色',   en: 'Blue' },
      { value: 'purple', hex: '#A855F7', zh: '紫色',   en: 'Purple' }
    ];

    // 自定义颜色列表（# 开头）
    const customColors = [];
    colorSet.forEach(c => {
      if (c.startsWith('#')) customColors.push(c);
    });

    // 构建下拉选项 HTML
    let optionsHtml = '';

    // "全部颜色" 选项
    const allLabel = this.language === 'zh_CN' ? '全部颜色' : 'All Colors';
    optionsHtml += `<div class="custom-select-option${currentValue === '' ? ' active' : ''}" data-value="">` +
      `<span class="color-dot" style="background:transparent;border:1px solid var(--border-color);"></span>` +
      `<span>${allLabel}</span></div>`;

    // 实际存在的预设颜色
    presetList.forEach(p => {
      if (colorSet.has(p.value)) {
        const label = this.language === 'zh_CN' ? p.zh : p.en;
        optionsHtml += `<div class="custom-select-option${currentValue === p.value ? ' active' : ''}" data-value="${p.value}">` +
          `<span class="color-dot" style="background:${p.hex}"></span>` +
          `<span>${label}</span></div>`;
      }
    });

    // 自定义颜色
    customColors.sort().forEach(hex => {
      const label = this.guessColorName(hex);
      optionsHtml += `<div class="custom-select-option${currentValue === hex ? ' active' : ''}" data-value="${hex}">` +
        `<span class="color-dot" style="background:${hex}"></span>` +
        `<span>${label}</span></div>`;
    });

    // "无颜色" 选项
    const noColorLabel = this.language === 'zh_CN' ? '无颜色' : 'No Color';
    optionsHtml += `<div class="custom-select-option${currentValue === '__nocolor__' ? ' active' : ''}" data-value="__nocolor__">` +
      `<span class="color-dot" style="background:transparent;border:1px dashed var(--border-color);"></span>` +
      `<span style="font-style:italic;color:var(--text-tertiary);">${noColorLabel}</span></div>`;

    dropdown.innerHTML = optionsHtml;

    // 更新触发器显示
    this._updateColorFilterTrigger();

    // 绑定选项点击事件
    dropdown.querySelectorAll('.custom-select-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = opt.dataset.value;
        this.colorFilter = val;
        this.renderFolders();
        this.updateColorFilterOptions();
        container.querySelector('.custom-select-dropdown').classList.add('hidden');
      });
    });
  }

  /**
   * 更新颜色筛选触发器显示（圆点 + 文字）
   */
  _updateColorFilterTrigger() {
    const container = document.getElementById('colorFilterSelect');
    if (!container) return;

    const dot = container.querySelector('.custom-select-dot');
    const label = container.querySelector('.custom-select-label');

    const presetMap = {
      '':            { hex: 'transparent', zh: '全部颜色', en: 'All Colors' },
      'red':         { hex: '#EF4444',    zh: '红色',     en: 'Red' },
      'orange':      { hex: '#F97316',    zh: '橙色',     en: 'Orange' },
      'yellow':      { hex: '#EAB308',    zh: '黄色',     en: 'Yellow' },
      'green':       { hex: '#22C55E',    zh: '绿色',     en: 'Green' },
      'blue':        { hex: '#3B82F6',    zh: '蓝色',     en: 'Blue' },
      'purple':      { hex: '#A855F7',    zh: '紫色',     en: 'Purple' },
      '__nocolor__': { hex: 'transparent', zh: '无颜色',   en: 'No Color', dashed: true }
    };

    const val = this.colorFilter;
    let hex = '';
    let text = '';
    let isDashed = false;

    if (presetMap[val]) {
      hex = presetMap[val].hex;
      text = this.language === 'zh_CN' ? presetMap[val].zh : presetMap[val].en;
      isDashed = !!presetMap[val].dashed;
    } else if (val && val.startsWith('#')) {
      hex = val;
      text = this.guessColorName(val);
    } else {
      hex = 'transparent';
      text = this.language === 'zh_CN' ? '全部颜色' : 'All Colors';
    }

    if (dot) {
      dot.style.background = isDashed ? 'transparent' : hex;
      dot.style.borderColor = isDashed ? 'var(--border-color)' : (hex === 'transparent' ? 'var(--border-color)' : 'rgba(0,0,0,0.1)');
      dot.style.borderStyle = isDashed ? 'dashed' : 'solid';
    }
    if (label) {
      label.textContent = text;
    }
  }

  /**
   * 根据 hex 值猜测颜色名称
   * 通过 RGB 欧氏距离匹配最近似色名
   * 颜色库按「深色 → 标准 → 浅色 → 淡色(pastel) → 近白」梯度排列
   */
  guessColorName(hex) {
    // 颜色数据库（hex → [r, g, b, 中文名, 英文名]）
    // 每个色系均覆盖：深色/标准/浅色/淡色/近白 五个亮度梯度
    const colorDB = [
      // ── 红色系 ──
      ['#8B0000', 139,  0,  0,   '暗红',     'Dark Red'],
      ['#A52A2A', 165, 42, 42,   '栗色',     'Maroon'],
      ['#B91C1C', 185, 28, 28,   '深红',     'Deep Red'],
      ['#DC2626', 220, 38, 38,   '赤红',     'Crimson'],
      ['#EF4444', 239, 68, 68,   '红色',     'Red'],
      ['#F87171', 248,113,113,   '亮红',     'Bright Red'],
      ['#FF0000', 255,  0,  0,   '纯红',     'Pure Red'],
      ['#FF5733', 255, 87, 51,   '珊瑚红',   'Coral Red'],
      ['#FF6347', 255, 99, 71,   '番茄红',   'Tomato'],
      ['#FCA5A5', 252,165,165,   '浅红',     'Light Red'],
      ['#FADBD8', 250,219,216,   '淡红',     'Pale Red'],
      ['#FDEDEC', 253,237,236,   '粉白红',   'Pinkish White'],
      // ── 橙色系 ──
      ['#E65100', 230, 81,  0,   '铁锈橙',   'Rust Orange'],
      ['#FF8C00', 255,140,  0,   '橙色',     'Orange'],
      ['#F97316', 249,115, 22,   '亮橙',     'Bright Orange'],
      ['#FFA500', 255,165,  0,   '琥珀橙',   'Amber Orange'],
      ['#FFB347', 255,179, 71,   '蜜橙',     'Honey Orange'],
      ['#FF7F50', 255,127, 80,   '珊瑚橙',   'Coral'],
      ['#FDBA74', 253,186,116,   '浅橙',     'Light Orange'],
      ['#FAD7A0', 250,215,160,   '淡橙',     'Pale Orange'],
      ['#FEF5E7', 254,245,231,   '奶橙',     'Creamy Orange'],
      // ── 黄色/金色系 ──
      ['#CA8A04', 202,138,  4,   '暗金',     'Dark Gold'],
      ['#FFD700', 255,215,  0,   '金色',     'Gold'],
      ['#F59E0B', 245,158, 11,   '琥珀黄',   'Amber'],
      ['#FFC107', 255,193,  7,   '金黄',     'Golden'],
      ['#EAB308', 234,179,  8,   '金黄花',   'Golden Yellow'],
      ['#FACC15', 250,204, 21,   '柠檬黄',   'Lemon'],
      ['#FBBF24', 251,191, 36,   '鲜黄',     'Vivid Yellow'],
      ['#FFFF00', 255,255,  0,   '黄色',     'Yellow'],
      ['#FDE047', 253,224, 71,   '浅黄',     'Light Yellow'],
      ['#FCF3CF', 252,243,207,   '淡黄',     'Pale Yellow'],
      ['#FEF9E7', 254,249,231,   '奶黄',     'Creamy Yellow'],
      ['#FFF9C4', 255,249,196,   '柠檬白',   'Lemon White'],
      // ── 绿色系 ──
      ['#14532D',  20, 83, 45,   '深林绿',   'Deep Forest'],
      ['#166534',  22,101, 52,   '墨绿',     'Forest Green'],
      ['#008000',   0,128,  0,   '绿色',     'Green'],
      ['#16A34A',  22,163, 74,   '深绿',     'Dark Green'],
      ['#22C55E',  34,197, 94,   '亮绿',     'Bright Green'],
      ['#059669',   5,150,105,   '翠绿',     'Emerald'],
      ['#10B981',  16,185,129,   '翡翠绿',   'Jade'],
      ['#34D399',  52,211,153,   '薄荷绿',   'Mint'],
      ['#6EE7B7', 110,231,183,   '浅绿',     'Light Green'],
      ['#86EFAC', 134,239,172,   '嫩绿',     'Pale Green'],
      ['#A7F3D0', 167,243,208,   '薄荷白',   'Mint Cream'],
      ['#D5F5E3', 213,245,227,   '淡绿',     'Pale Green'],
      ['#EAFAF1', 234,250,241,   '冰绿',     'Ice Green'],
      ['#F0FFF0', 240,255,240,   '蜜露绿',   'Honeydew'],
      // ── 青色/蓝绿色系 ──
      ['#115E59',  17, 94, 89,   '孔雀绿',   'Peacock'],
      ['#0D9488',  13,148,136,   '凫绿',     'Teal'],
      ['#008080',   0,128,128,   '凫蓝',     'Teal Blue'],
      ['#00AAAA',   0,170,170,   '亮凫绿',   'Bright Teal'],
      ['#00FFFF',   0,255,255,   '青色',     'Cyan'],
      ['#06B6D4',   6,182,212,   '亮青',     'Bright Cyan'],
      ['#0891B2',   8,145,178,   '深青',     'Dark Cyan'],
      ['#67E8F9', 103,232,249,   '浅青',     'Light Cyan'],
      ['#A5F3FC', 165,243,252,   '天青',     'Sky Cyan'],
      ['#CCFBF1', 204,251,241,   '淡青',     'Pale Cyan'],
      ['#D1F2EB', 209,242,235,   '青白',     'Cyan White'],
      ['#E0F7FA', 224,247,250,   '冰青',     'Ice Cyan'],
      ['#E8F8F5', 232,248,245,   '淡凫绿',   'Pale Teal'],
      // ── 蓝色系（重点加强，覆盖全亮度梯度）──
      ['#191970',  25, 25,112,   '午夜蓝',   'Midnight Blue'],
      ['#00008B',   0,  0,139,   '暗蓝',     'Dark Blue'],
      ['#0000CD',   0,  0,205,   '中蓝',     'Medium Blue'],
      ['#0000FF',   0,  0,255,   '蓝色',     'Blue'],
      ['#1D4ED8',  29, 78,216,   '海军蓝',   'Navy Blue'],
      ['#2563EB',  37, 99,235,   '深蓝',     'Dark Blue'],
      ['#3B82F6',  59,130,246,   '亮蓝',     'Bright Blue'],
      ['#1E40AF',  30, 64,175,   '藏蓝',     'Navy'],
      ['#0EA5E9',  14,165,233,   '天蓝',     'Sky Blue'],
      ['#0369A1',   3,105,161,   '钴蓝',     'Cobalt'],
      ['#4F46E5',  79, 70,229,   '靛蓝',     'Indigo'],
      ['#60A5FA',  96,165,250,   '矢车菊',   'Cornflower'],
      ['#38BDF8',  56,189,248,   '浅天蓝',   'Light Sky'],
      ['#0C4A6E',  12, 74,110,   '钢蓝',     'Steel Blue'],
      ['#87CEEB', 135,206,235,   '天蓝色',   'Sky Blue Web'],
      ['#7DD3FC', 125,211,252,   '淡蓝',     'Pale Blue'],
      ['#ADD8E6', 173,216,230,   '浅蓝',     'Light Blue'],
      ['#B0E0E6', 176,224,230,   '粉蓝',     'Powder Blue'],
      ['#BBDEFB', 187,222,251,   '材料蓝',   'Material Blue'],
      ['#B4D7FF', 180,215,255,   '婴儿蓝',   'Baby Blue'],
      ['#C6E2FF', 198,226,255,   '冰蓝',     'Ice Blue'],
      ['#D6EAF8', 214,234,248,   '淡冰蓝',   'Pale Ice Blue'],
      ['#E3F2FD', 227,242,253,   '近白蓝',   'Near White Blue'],
      ['#EBF5FB', 235,245,251,   '天空白',   'Sky White'],
      // ── 紫色/紫红系 ──
      ['#4C1D95',  76, 29,149,   '暗紫',     'Dark Purple'],
      ['#5B21B6',  91, 33,182,   '茄紫',     'Aubergine'],
      ['#6D28D9', 109, 40,217,   '紫罗兰',   'Violet'],
      ['#7C3AED', 124, 58,237,   '深紫',     'Deep Purple'],
      ['#800080', 128,  0,128,   '紫色',     'Purple'],
      ['#9333EA', 147, 51,234,   '亮紫',     'Bright Purple'],
      ['#A855F7', 168, 85,247,   '紫藤色',   'Wisteria'],
      ['#8B5CF6', 139, 92,246,   '薰衣草紫', 'Lavender Purple'],
      ['#C084FC', 192,132,252,   '浅紫',     'Light Purple'],
      ['#D7BDE2', 215,189,226,   '淡紫',     'Pale Purple'],
      ['#E9D5FF', 233,213,255,   '浅紫白',   'Light Purple White'],
      ['#E8DAEF', 232,218,239,   '淡紫白',   'Pale Purple White'],
      ['#F4ECF7', 244,236,247,   '紫白',     'Purple White'],
      ['#D946EF', 217, 70,239,   '洋红',     'Magenta'],
      ['#C026D3', 192, 38,211,   '品红',     'Fuchsia'],
      // ── 粉色系 ──
      ['#9D174D', 157, 23, 77,   '暗粉',     'Dark Pink'],
      ['#BE185D', 190, 24, 93,   '酒红',     'Burgundy'],
      ['#DB2777', 219, 39,119,   '深粉',     'Dark Pink'],
      ['#EC4899', 236, 72,153,   '粉色',     'Pink'],
      ['#F43F5E', 244, 63, 94,   '玫瑰',     'Rose'],
      ['#FF69B4', 255,105,180,   '热粉',     'Hot Pink'],
      ['#FFC0CB', 255,192,203,   '粉色',     'Pink'],
      ['#F472B6', 244,114,182,   '玫瑰粉',   'Rose Pink'],
      ['#FB7185', 251,113,133,   '珊瑚粉',   'Coral Pink'],
      ['#FECDD3', 254,205,211,   '浅粉',     'Light Pink'],
      ['#FFB6C1', 255,182,193,   '桃粉',     'Peach Pink'],
      ['#FBCFE8', 251,207,232,   '淡粉',     'Pale Pink'],
      ['#FDEDF3', 253,237,243,   '粉白',     'Pinkish White'],
      ['#FCE4EC', 252,228,236,   '浅粉白',   'Light Pink White'],
      // ── 棕色/肤色系 ──
      ['#654321', 101, 67, 33,   '暗棕',     'Dark Brown'],
      ['#8B4513', 139, 69, 19,   '鞍棕',     'Saddle Brown'],
      ['#A52A2A', 165, 42, 42,   '棕色',     'Brown'],
      ['#A0522D', 160, 82, 45,   '赭色',     'Sienna'],
      ['#92400E', 146, 64, 14,   '深棕',     'Deep Brown'],
      ['#B45309', 180, 83,  9,   '赤棕',     'Reddish Brown'],
      ['#D97706', 217,119,  6,   '琥珀棕',   'Amber Brown'],
      ['#CD853F', 205,133, 63,   '秘鲁棕',   'Peru'],
      ['#DEB887', 222,184,135,   '浅棕',     'Burlywood'],
      ['#F5DEB3', 245,222,179,   '小麦色',   'Wheat'],
      ['#FAEBD7', 250,235,215,   '古董白',   'Antique White'],
      ['#FFE4C4', 255,228,196,   '糕点色',   'Bisque'],
      ['#FFDAB9', 255,218,185,   '桃色',     'Peach'],
      // ── 灰色/黑白系 ──
      ['#000000',   0,  0,  0,   '黑色',     'Black'],
      ['#1A1A1A',  26, 26, 26,   '近黑',     'Near Black'],
      ['#2D2D2D',  45, 45, 45,   '暗灰',     'Dark Charcoal'],
      ['#404040',  64, 64, 64,   '炭灰',     'Charcoal'],
      ['#525252',  82, 82, 82,   '深灰',     'Dark Gray'],
      ['#808080', 128,128,128,   '灰色',     'Gray'],
      ['#A3A3A3', 163,163,163,   '中性灰',   'Neutral Gray'],
      ['#C0C0C0', 192,192,192,   '银色',     'Silver'],
      ['#D1D5DB', 209,213,219,   '浅灰',     'Light Gray'],
      ['#E5E7EB', 229,231,235,   '淡灰',     'Pale Gray'],
      ['#F3F4F6', 243,244,246,   '月白',     'Off White'],
      ['#F9FAFB', 249,250,251,   '瓷白',     'Porcelain'],
      ['#FFFFFF', 255,255,255,   '白色',     'White'],
      // ── 特殊/霓虹色 ──
      ['#00FF00',   0,255,  0,   '酸橙绿',   'Lime'],
      ['#39FF14',  57,255, 20,   '霓虹绿',   'Neon Green'],
      ['#FF00FF', 255,  0,255,   '霓虹粉',   'Neon Pink'],
      ['#00FFAA',   0,255,170,   '霓虹青',   'Neon Cyan'],
      ['#FF00AA', 255,  0,170,   '霓虹紫',   'Neon Purple'],
      ['#FFAA00', 255,170,  0,   '霓虹橙',   'Neon Orange'],
      ['#00FF41',   0,255, 65,   '矩阵绿',   'Matrix Green']
    ];

    // 解析 hex 为 RGB（支持 3 位和 6 位 hex）
    const parseHex = (h) => {
      let s = h.replace('#', '');
      if (s.length === 3) {
        s = s[0]+s[0]+s[1]+s[1]+s[2]+s[2];
      }
      const v = parseInt(s, 16);
      if (isNaN(v)) return [128, 128, 128];
      return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    };

    const rgb = parseHex(hex);

    // 等权欧氏距离（避免单一通道主导匹配结果）
    let minDist = Infinity;
    let bestName = '';

    colorDB.forEach(entry => {
      const dr = rgb[0] - entry[1];
      const dg = rgb[1] - entry[2];
      const db = rgb[2] - entry[3];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < minDist) {
        minDist = dist;
        bestName = this.language === 'zh_CN' ? entry[4] : entry[5];
      }
    });

    return bestName || (this.language === 'zh_CN' ? '自定义颜色' : 'Custom Color');
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
      this.updateColorFilterOptions();
      this._hasScanned = true;
      this.showLoading(false);
    } catch (error) {
      console.error('Scan failed:', error);
      this.showLoading(false);
      showNotification((i18n.getMessage('scanFailed') || 'Scan failed: $1').replace('$1', error.message), 'error');
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
    
    // 切换到设置页时刷新撤销历史
    if (tab === TABS.SETTINGS) {
      this.renderUndoHistory();
    }
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
        this.switchTab(TABS.SMART);
        // 滚动到空文件夹区域
        setTimeout(() => {
          const section = document.getElementById('emptyFoldersSection');
          if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
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
      case TABS.DUPLICATES:
        this.renderDuplicates();
        break;
      case TABS.SMART:
        this.renderSmartPage();
        break;
      case TABS.STATS:
        this.renderStats();
        break;
      case TABS.SETTINGS:
        this.renderSettings();
        break;
    }
  }

  /**
   * 渲染统计页面
   */
  renderStats() {
    // 计算统计 data
    const totalFolders = this.folders.length;
    const totalBookmarks = this.folders.reduce((sum, f) => sum + f.bookmarkCount, 0);
    const avgBookmarks = totalFolders > 0 ? (totalBookmarks / totalFolders).toFixed(1) : 0;
    const coloredFolders = this.folders.filter(f => f._color).length;
    const coloredPercent = totalFolders > 0 ? Math.round((coloredFolders / totalFolders) * 100) : 0;

    // 更新概览卡片
    document.getElementById('statsTotalFolders').textContent = totalFolders;
    document.getElementById('statsTotalBookmarks').textContent = totalBookmarks;
    document.getElementById('statsAvgBookmarks').textContent = avgBookmarks;
    document.getElementById('statsColoredFolders').textContent = coloredPercent + '%';

    // 颜色分布
    this._renderColorDistribution();

    // 大小分布
    this._renderSizeDistribution();

    // 绑定智能分类按钮
    const smartClassifyBtn = document.getElementById('smartClassifyBtn');
    if (smartClassifyBtn && !smartClassifyBtn._bound) {
      smartClassifyBtn._bound = true;
      smartClassifyBtn.addEventListener('click', () => {
        this._runSmartClassify();
      });
    }
  }

  /**
   * 渲染颜色分布图表
   */
  _renderColorDistribution() {
    const colorMap = {};
    this.folders.forEach(f => {
      const color = f._color || 'none';
      colorMap[color] = (colorMap[color] || 0) + 1;
    });

    const total = this.folders.length;
    const colorList = Object.entries(colorMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8); // 只显示前 8 种

    const colorNames = {
      'none': { zh: '无颜色', en: 'No Color' },
      'red': { zh: '红色', en: 'Red' },
      'orange': { zh: '橙色', en: 'Orange' },
      'yellow': { zh: '黄色', en: 'Yellow' },
      'green': { zh: '绿色', en: 'Green' },
      'blue': { zh: '蓝色', en: 'Blue' },
      'purple': { zh: '紫色', en: 'Purple' }
    };

    const container = document.getElementById('statsColorChart');
    container.innerHTML = colorList.map(([color, count]) => {
      const percent = total > 0 ? (count / total * 100) : 0;
      const name = colorNames[color] ? (this.language === 'zh_CN' ? colorNames[color].zh : colorNames[color].en) : color;
      const hex = color.startsWith('#') ? color : (this._getPresetColorHex(color) || '#808080');
      return `
        <div class="stats-bar-item">
          <span class="stats-bar-label">${name}</span>
          <div class="stats-bar-track">
            <div class="stats-bar-fill" style="width: ${percent}%; background: ${hex};"></div>
          </div>
          <span class="stats-bar-value">${count}</span>
        </div>
      `;
    }).join('');
  }

  /**
   * 渲染大小分布图表
   */
  _renderSizeDistribution() {
    const sizeRanges = [
      { label: { zh: '0 书签', en: '0 bookmarks' }, min: 0, max: 0 },
      { label: { zh: '1-5', en: '1-5' }, min: 1, max: 5 },
      { label: { zh: '6-20', en: '6-20' }, min: 6, max: 20 },
      { label: { zh: '21-50', en: '21-50' }, min: 21, max: 50 },
      { label: { zh: '50+', en: '50+' }, min: 51, max: Infinity }
    ];

    const total = this.folders.length;
    const container = document.getElementById('statsSizeChart');
    container.innerHTML = sizeRanges.map(range => {
      const count = this.folders.filter(f => f.bookmarkCount >= range.min && f.bookmarkCount <= range.max).length;
      const percent = total > 0 ? (count / total * 100) : 0;
      const label = this.language === 'zh_CN' ? range.label.zh : range.label.en;
      return `
        <div class="stats-bar-item">
          <span class="stats-bar-label">${label}</span>
          <div class="stats-bar-track">
            <div class="stats-bar-fill" style="width: ${percent}%; background: var(--primary);"></div>
          </div>
          <span class="stats-bar-value">${count}</span>
        </div>
      `;
    }).join('');
  }

  /**
   * 获取预设颜色 hex 值
   */
  _getPresetColorHex(color) {
    const map = {
      'red': '#EF4444',
      'orange': '#F97316',
      'yellow': '#EAB308',
      'green': '#22C55E',
      'blue': '#3B82F6',
      'purple': '#A855F7'
    };
    return map[color] || color;
  }

  /**
   * 运行智能分类
   */
  async _runSmartClassify() {
    const results = [];
    const uncoloredFolders = this.folders.filter(f => !f._color);

    for (const folder of uncoloredFolders) {
      const suggestedColor = this._suggestColorFromName(folder.title);
      if (suggestedColor) {
        results.push({ folder, suggestedColor });
      }
    }

    const container = document.getElementById('smartClassifyResults');
    if (results.length === 0) {
      container.innerHTML = `<div class="empty-state" style="padding: 12px;"><span>${i18n.getMessage('noSuggestions') || 'No suggestions'}</span></div>`;
      return;
    }

    container.innerHTML = results.map(({ folder, suggestedColor }) => {
      const hex = this._getPresetColorHex(suggestedColor) || suggestedColor;
      const colorName = this.guessColorName(hex);
      return `
        <div class="smart-classify-item" data-folder-id="${folder.id}">
          <span class="folder-name">${this.escapeHtml(folder.title)}</span>
          <span class="suggested-color">
            <span class="color-dot" style="background: ${hex};"></span>
            <span>${colorName}</span>
          </span>
          <button class="btn btn-primary btn-xs apply-btn" data-folder-id="${folder.id}" data-color="${suggestedColor}">${i18n.getMessage('apply') || 'Apply'}</button>
        </div>
      `;
    }).join('');

    // 绑定应用按钮
    container.querySelectorAll('.apply-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const folderId = btn.dataset.folderId;
        const color = btn.dataset.color;
        await FolderColorService.setColor(folderId, color);
        this.folderColors = await FolderColorService.loadColors();
        this.folders.forEach(f => {
          f._color = this.folderColors[f.id] || '';
        });
        this.renderStats();
        showNotification(i18n.getMessage('smartClassifyDone').replace('$1', results.length), 'success');
      });
    });

    showNotification(i18n.getMessage('smartClassifyDone').replace('$1', results.length), 'success');
  }

  /**
   * 根据文件夹名称推荐颜色
   */
  _suggestColorFromName(name) {
    const lowerName = name.toLowerCase();
    
    // 关键词 → 颜色映射
    const keywords = {
      red: ['红', 'red', '重要', 'important', '紧急', 'urgent', '错误', 'error', '警告', 'warning'],
      orange: ['橙', 'orange', '项目', 'project', '工作', 'work', '待办', 'todo'],
      yellow: ['黄', 'yellow', '笔记', 'note', '草稿', 'draft', '临时', 'temp'],
      green: ['绿', 'green', '完成', 'done', '成功', 'success', '健康', 'health', '学习', 'study'],
      blue: ['蓝', 'blue', '技术', 'tech', '开发', 'dev', '代码', 'code', '文档', 'doc'],
      purple: ['紫', 'purple', '创意', 'creative', '设计', 'design', '灵感', 'inspiration']
    };

    for (const [color, words] of Object.entries(keywords)) {
      if (words.some(word => lowerName.includes(word))) {
        return color;
      }
    }

    return null;
  }

  /**
   * 渲染文件夹列表（含复选框）
   */
  async renderFolders(reset = true) {
    const container = document.getElementById('foldersList');
    let folders = [];

    if (reset) {
      this.folderRenderedCount = this.folderPageSize;
    }

    if (!this.searchQuery || this.searchMode === 'folder') {
      // 文件夹名称搜索（或空搜索）
      let list = FolderScanner.searchFolders(this.folders, this.searchQuery);
      // 颜色筛选
      if (this.colorFilter === '__nocolor__') {
        // 无颜色：_color 为空或 undefined
        list = list.filter(f => !f._color);
      } else if (this.colorFilter) {
        list = list.filter(f => f._color === this.colorFilter);
      }
      folders = FolderScanner.sortFolders(list, this.currentSort);
      // 过滤根文件夹
      if (this.hideRootFolders) {
        folders = folders.filter(f => !f.isRoot);
      }
    } else if (this.searchMode === 'bookmark' && this.searchQuery) {
      // 书签内容搜索
      await this.renderBookmarkSearchResults(container);
      return;
    }

    if (folders.length === 0 && !this.searchQuery) {
      if (!this._hasScanned) {
        // 未扫描：显示扫描中状态
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📂</div>' +
          '<div class="empty-state-title">' + (i18n.getMessage('scanningBookmarks') || 'Scanning your bookmarks...') + '</div>' +
          '<div class="spinner" style="width:18px;height:18px;margin-top:8px;"></div></div>';
        return;
      }
      // 首次进入 / 真的没有文件夹：引导型 empty state
      container.innerHTML = '<div class="empty-state">' +
        '<div class="empty-state-icon">📁</div>' +
        '<div class="empty-state-title">' + i18n.getMessage('noFoldersFound') + '</div>' +
        '<div class="empty-state-desc">' + (i18n.getMessage('noFoldersDesc') || 'Your bookmarks will appear here once scanned. Add a folder or re-scan to get started.') + '</div>' +
        '<div class="empty-state-action"><button id="emptyStateNewFolder" class="btn btn-primary btn-sm">' + (i18n.getMessage('newFolder') || 'New Folder') + '</button></div></div>';
      container.querySelector('#emptyStateNewFolder').addEventListener('click', () => {
        document.getElementById('newFolderBtn').click();
      });
      return;
    }
    if (folders.length === 0 && this.searchQuery) {
      container.innerHTML = '<div class="empty-state"><p>' + (i18n.getMessage('noSearchResults') || 'No results found') + '</p>' +
        '<div class="empty-state-action"><button class="btn btn-secondary btn-sm" data-action="clearFilters">' + (i18n.getMessage('clearFilters') || 'Clear Filters') + '</button></div></div>';
      container.querySelector('[data-action="clearFilters"]').addEventListener('click', () => {
        document.getElementById('searchInput').value = '';
        this.searchQuery = '';
        this.colorFilter = '';
        this.renderFolders();
        const clearBtn = document.getElementById('searchClearBtn');
        if (clearBtn) clearBtn.classList.remove('visible');
      });
      return;
    }

    // 分页：只渲染已计数量的文件夹
    const visibleFolders = folders.slice(0, this.folderRenderedCount);
    container.innerHTML = visibleFolders.map(folder => this.createFolderCard(folder)).join('');

    // 如果还有更多，追加「加载更多」按钮
    if (this.folderRenderedCount < folders.length) {
      const loadMoreBtn = document.createElement('button');
      loadMoreBtn.className = 'btn btn-secondary btn-sm';
      loadMoreBtn.style.cssText = 'display:block;margin:12px auto;width:120px;';
      loadMoreBtn.textContent = i18n.getMessage('loadMore') || 'Load More';
      loadMoreBtn.id = 'loadMoreFoldersBtn';
      loadMoreBtn.addEventListener('click', () => {
        this.folderRenderedCount += this.folderPageSize;
        this.renderFolders(false);
      });
      container.appendChild(loadMoreBtn);
    }

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

      // 过滤根文件夹
      if (this.hideRootFolders) {
        let i = 0;
        while (i < folderInfos.length) {
          if (folderInfos[i].folder.isRoot) {
            folderInfos.splice(i, 1);
          } else {
            i++;
          }
        }
      }

      if (folderInfos.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>' + (i18n.getMessage('noSearchResults') || 'No results found') + '</p>' +
          '<div class="empty-state-action"><button class="btn btn-secondary btn-sm" data-action="clearFilters">' + (i18n.getMessage('clearFilters') || 'Clear Filters') + '</button></div></div>';
        // 绑定清除筛选按钮
        container.querySelector('[data-action="clearFilters"]').addEventListener('click', () => {
          document.getElementById('searchInput').value = '';
          this.searchQuery = '';
          this.colorFilter = '';
          this.renderFolders();
          const clearBtn = document.getElementById('searchClearBtn');
          if (clearBtn) clearBtn.classList.remove('visible');
        });
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

    const isExpanded = contentEl.dataset.bookmarkExpanded === 'true';
    const displayBookmarks = isExpanded ? bookmarks : bookmarks.slice(0, 30);

    let html = `<div class="details-section" data-section="bookmarks">
      <div class="details-section-title">🔗 ${i18n.getMessage('matchingBookmarks') || 'Matching Bookmarks'} (${bookmarks.length})</div>
      ${displayBookmarks.map(b => `
        <div class="details-item details-bookmark-item" data-bookmark-id="${b.id}" data-bookmark-url="${this.escapeHtml(b.url)}" title="${this.escapeHtml(b.url)}">
          <img class="details-bookmark-favicon" src="${this.getFaviconUrl(b.url)}" alt="🔗">
          <span class="details-item-name">${this.escapeHtml(b.title || b.url)}</span>
          <button class="details-item-move" data-bookmark-id="${b.id}" title="${i18n.getMessage('moveBookmark') || 'Move'}">➤</button>
          <button class="details-item-delete" data-bookmark-id="${b.id}" title="${i18n.getMessage('delete') || 'Delete'}">×</button>
        </div>
      `).join('')}
      ${bookmarks.length > 30 ? `
        <div class="details-more" data-folder-id="${folderId}" data-action="${isExpanded ? 'collapse' : 'expand'}" data-total="${bookmarks.length}">
          ${isExpanded
            ? `↑ ${i18n.getMessage('collapse') || 'Collapse'}`
            : `+${bookmarks.length - 30} ${i18n.getMessage('more') || 'more'}...`}
        </div>
      ` : ''}
    </div>`;

    contentEl.innerHTML = html;

    // 绑定事件委托（打开 + 删除）
    this.bindDetailsEvents(folderId);
    this.bindFaviconFallbacks(contentEl);
  }

  /**
   * 获取书签的真实 favicon 地址（Chrome 官方 favicon API）
   * @param {string} url - 书签 URL
   * @returns {string} favicon 图片地址
   */
  getFaviconUrl(url) {
    try {
      return chrome.runtime.getURL('/_favicon/?pageUrl=' + encodeURIComponent(url) + '&size=32');
    } catch (e) {
      return '';
    }
  }

  /**
   * 为已渲染的书签 favicon 图片绑定加载失败兜底
   * @param {HTMLElement} container - 包含 .details-bookmark-favicon 的容器
   */
  bindFaviconFallbacks(container) {
    if (!container) return;
    container.querySelectorAll('.details-bookmark-favicon').forEach(img => {
      const fallback = () => {
        const span = document.createElement('span');
        span.className = 'details-bookmark-favicon';
        span.textContent = '🔗';
        img.replaceWith(span);
      };
      // 已加载失败的直接替换（错过 error 事件的情况）
      if (img.complete && img.naturalHeight === 0) { fallback(); return; }
      img.addEventListener('error', fallback);
    });
  }

  /**
   * 创建文件夹卡片 HTML（紧凑布局）
   */
  createFolderCard(folder) {
    const isSelected = this.selectedFolderIds.has(folder.id);
    const color = folder._color || '';
    const icon = this.folderIcons[folder.id] || '';
    const displayIcon = icon || '📁';
    const isExpanded = this.expandedFolders.has(folder.id);
    const expandClass = isExpanded ? 'expanded' : '';
    const hasNote = folder.note && folder.note.trim().length > 0;

    // Stats 内联到 header 尾部
    const statsHtml = `
      <span class="folder-stat-inline" title="${i18n.getMessage('bookmarks') || 'Bookmarks'}">📄${folder.bookmarkCount}</span>
      <span class="folder-stat-inline" title="${i18n.getMessage('subfolders') || 'Subfolders'}">📁${folder.subfolderCount}</span>
      ${folder.dateGroupModified ? `<span class="folder-stat-inline" title="${i18n.getMessage('lastModified') || 'Last modified'}">🕒${formatDate(folder.dateGroupModified)}</span>` : ''}
    `;

    const colorStyle = color ? `border-left-color:${FolderColorService.getHex(color)};` : '';
    return `
      <div class="folder-card compact ${isSelected ? 'selected' : ''}" data-folder-id="${folder.id}" tabindex="0" style="${colorStyle}">
        <!-- 单行 Header：checkbox + 展开 + 图标 + 标题路径 + stats -->
        <div class="folder-card-header">
          <label class="folder-checkbox">
            <input type="checkbox" data-folder-id="${folder.id}" ${isSelected ? 'checked' : ''}>
          </label>
          <button class="folder-expand-btn ${expandClass}" data-folder-id="${folder.id}" title="${i18n.getMessage('toggleExpand') || 'Expand'}">
            <span class="expand-chevron">▸</span>
          </button>
          <div class="folder-icon-btn" data-folder-id="${folder.id}" title="${i18n.getMessage('setIcon') || 'Set icon'}">
            <span class="folder-icon-display">${displayIcon}</span>
          </div>
          <div class="folder-color-dot" data-folder-id="${folder.id}" title="${i18n.getMessage('setColor') || 'Set color'}">
            ${color ? `<span class="color-dot" style="background:${FolderColorService.getHex(color)}"></span>` : '🎨'}
          </div>
          <div class="folder-header">
            <div class="folder-name">
              <span class="folder-title-text">${this.escapeHtml(folder.title)}</span>
              <span class="folder-path">${this.escapeHtml(this.translatePath(folder.path))}</span>
            </div>
          </div>
          <div class="folder-stats-inline">${statsHtml}</div>
        </div>

        <!-- Hover 时显示的操作按钮 -->
        <div class="folder-actions-bar" style="justify-content: ${this.actionPosition === 'right' ? 'flex-end' : 'flex-start'};">
          <button class="btn btn-secondary btn-xs" data-action="open" data-folder-id="${folder.id}">${i18n.getMessage('open')}</button>
          <button class="btn btn-secondary btn-xs" data-action="merge" data-folder-id="${folder.id}">${i18n.getMessage('merge')}</button>
          <button class="btn btn-secondary btn-xs" data-action="rename" data-folder-id="${folder.id}">${i18n.getMessage('rename')}</button>
          ${!folder.isRoot ? `<button class="btn btn-danger btn-xs" data-action="delete" data-folder-id="${folder.id}">${i18n.getMessage('delete')}</button>` : ''}
        </div>

        <!-- 备注：有备注时显示摘要，点击展开 -->
        ${hasNote ? `
          <div class="folder-note-badge" data-folder-id="${folder.id}" title="${this.escapeHtml(folder.note)}">
            📝 ${this.escapeHtml(folder.note.slice(0, 30))}${folder.note.length > 30 ? '...' : ''}
          </div>
        ` : ''}

        <!-- 展开详情 -->
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
        this.updateColorFilterOptions();
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

    // 复选框（mousedown 捕获 shiftKey，change 处理切换）
    document.querySelectorAll('.folder-checkbox input').forEach(cb => {
      // mousedown 提前记录 shift 状态和当前索引
      cb.addEventListener('mousedown', (e) => {
        const folderId = e.target.dataset.folderId;
        const cards = Array.from(container.querySelectorAll('.folder-card'));
        const currentIndex = cards.findIndex(c => c.dataset.folderId === folderId);
        e.target._shiftPressed = e.shiftKey;
        e.target._cardIndex = currentIndex;
      });

      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        const folderId = e.target.dataset.folderId;
        const cards = Array.from(container.querySelectorAll('.folder-card'));
        const currentIndex = e.target._cardIndex ?? cards.findIndex(c => c.dataset.folderId === folderId);
        const shiftPressed = e.target._shiftPressed || false;

        // Shift 多选：范围选中
        if (shiftPressed && this._lastSelectedFolderIndex >= 0 && currentIndex >= 0 && currentIndex !== this._lastSelectedFolderIndex) {
          const min = Math.min(currentIndex, this._lastSelectedFolderIndex);
          const max = Math.max(currentIndex, this._lastSelectedFolderIndex);
          const newChecked = e.target.checked; // change 时已是新值
          for (let i = min; i <= max; i++) {
            const id = cards[i].dataset.folderId;
            const cb2 = cards[i].querySelector('input[type="checkbox"]');
            if (newChecked) {
              this.selectedFolderIds.add(id);
              if (cb2 && i !== currentIndex) cb2.checked = true; // 当前已由浏览器翻转
            } else {
              this.selectedFolderIds.delete(id);
              if (cb2 && i !== currentIndex) cb2.checked = false;
            }
          }
          this.updateBatchBar();
          return;
        }

        // 更新最后选中索引（Shift 锚点）
        this._lastSelectedFolderIndex = currentIndex;

        // 正常切换
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
      }
      return;
    }

    // 展开
    this.expandedFolders.add(folderId);
    detailsEl.classList.remove('hidden');
    detailsEl.classList.add('open');
    if (btnEl) {
      btnEl.classList.add('expanded');
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
        const isExpanded = contentEl.dataset.bookmarkExpanded === 'true';
        const displayBookmarks = isExpanded ? bookmarks : bookmarks.slice(0, 20);
        html += `<div class="details-section" data-section="bookmarks">
          <div class="details-section-title">📄 ${i18n.getMessage('bookmarks') || 'Bookmarks'} (${bookmarks.length})</div>
          ${displayBookmarks.map(b => `
            <div class="details-item details-bookmark-item" data-bookmark-id="${b.id}" data-bookmark-url="${this.escapeHtml(b.url)}" title="${this.escapeHtml(b.url)}">
              <img class="details-bookmark-favicon" src="${this.getFaviconUrl(b.url)}" alt="🔗">
              <span class="details-item-name">${this.escapeHtml(b.title || b.url)}</span>
              <button class="details-item-move" data-bookmark-id="${b.id}" title="${i18n.getMessage('moveBookmark') || 'Move'}">➤</button>
              <button class="details-item-delete" data-bookmark-id="${b.id}" title="${i18n.getMessage('delete') || 'Delete'}">×</button>
            </div>
          `).join('')}
          ${bookmarks.length > 20 ? `
            <div class="details-more" data-folder-id="${folderId}" data-action="${isExpanded ? 'collapse' : 'expand'}" data-total="${bookmarks.length}">
              ${isExpanded
                ? `↑ ${i18n.getMessage('collapse') || 'Collapse'}`
                : `+${bookmarks.length - 20} ${i18n.getMessage('more') || 'more'}...`}
            </div>
          ` : ''}
        </div>`;
      }

      if (subfolders.length === 0 && bookmarks.length === 0) {
        html = `<div class="details-empty">${i18n.getMessage('emptyFolder') || 'Empty folder'}</div>`;
      }

      contentEl.innerHTML = html;

      // 绑定事件委托（打开 + 删除）
      this.bindDetailsEvents(folderId);
      this.bindFaviconFallbacks(contentEl);
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
            showNotification((i18n.getMessage('deleteFailed') || 'Delete failed: $1').replace('$1', error.message), 'error');
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

      // 检查是否点击了移动按钮
      const moveBtn = e.target.closest('.details-item-move');
      if (moveBtn) {
        e.stopPropagation();
        const bookmarkId = moveBtn.dataset.bookmarkId;
        if (!bookmarkId) return;
        this.openMoveModal(bookmarkId, folderId);
        return;
      }

      // 检查是否点击了"更多"/"收起"按钮
      const moreBtn = e.target.closest('.details-more');
      if (moreBtn) {
        const action = moreBtn.dataset.action;
        if (action === 'expand') {
          contentEl.dataset.bookmarkExpanded = 'true';
          await this.renderFolderDetails(folderId);
        } else if (action === 'collapse') {
          contentEl.dataset.bookmarkExpanded = 'false';
          await this.renderFolderDetails(folderId);
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
    this._lastSelectedFolderIndex = -1;
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

    const foldersToDelete = ids
      .map(id => this.folders.find(f => f.id === id))
      .filter(folder => folder && !folder.isRoot)
      .map(folder => ({
        id: folder.id,
        title: folder.title,
        path: this.translatePath(folder.path),
        bookmarkCount: folder.bookmarkCount,
        subfolderCount: folder.subfolderCount
      }));
    const message = i18n.getMessage('confirmBatchDelete').replace('$1', ids.length) || 
      `Delete ${ids.length} folders?`;
    const previewMessage = this.buildDangerPreview(message, foldersToDelete);

    if (this.deleteConfirm) {
      this.showConfirmModal(
        i18n.getMessage('confirmDeleteTitle') || 'Confirm Delete',
        previewMessage,
        async () => {
          this.exportDangerBackup('batch-delete-folders', foldersToDelete);
          await this.doBatchDelete(ids);
        }
      );
    } else {
      this.exportDangerBackup('batch-delete-folders', foldersToDelete);
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
      showNotification(
        (i18n.getMessage('deletedWithFailures') || 'Deleted $1, $2 failed')
          .replace('$1', success)
          .replace('$2', failed),
        'error'
      );
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

    // 确认框
    this.showConfirmModal(
      i18n.getMessage('confirmBatchMerge') || 'Confirm Merge',
      (i18n.getMessage('confirmBatchMergeMessage') || 'Merge $1 selected folders into the target folder?').replace('$1', ids.length),
      () => this._doBatchMerge(ids)
    );
  }

  async _doBatchMerge(ids) {

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
        <span style="color:var(--text-tertiary);font-size:9px;">${this.escapeHtml(this.translatePath(f.path))}</span>
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
      showNotification((i18n.getMessage('saveNoteFailed') || 'Save note failed: $1').replace('$1', error.message), 'error');
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
      showNotification((i18n.getMessage('operationFailed') || 'Operation failed: $1').replace('$1', error.message), 'error');
    }
  }

  /**
   * 新建文件夹
   */
  async createFolder() {
    const folderName = await this.showPromptModal({
      title: i18n.getMessage('newFolder') || 'New Folder',
      message: i18n.getMessage('newFolderPlaceholder') || 'Enter folder name:',
      defaultValue: 'New Folder'
    });
    if (!folderName || folderName.trim() === '') return;

    try {
      await FolderOperations.createFolder(folderName.trim());
      showNotification(i18n.getMessage('folderCreated') || 'Folder created successfully', 'success');
      await this.scanBookmarks();
    } catch (error) {
      showNotification((i18n.getMessage('createFailed') || 'Create failed: $1').replace('$1', error.message), 'error');
    }
  }

  /**
   * 重命名文件夹
   */
  async renameFolder(folderId) {
    const folder = this.folders.find(f => f.id === folderId);
    if (!folder) return;

    const newName = await this.showPromptModal({
      title: i18n.getMessage('rename') || 'Rename',
      message: folder.title,
      defaultValue: folder.title
    });
    if (!newName || newName.trim() === '' || newName === folder.title) return;

    try {
      await FolderOperations.renameFolder(folderId, newName);
      showNotification(i18n.getMessage('renameSuccess') || 'Folder renamed successfully', 'success');
      await this.scanBookmarks();
    } catch (error) {
      showNotification((i18n.getMessage('renameFailed') || 'Rename failed: $1').replace('$1', error.message), 'error');
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
        <span style="color:var(--text-tertiary);font-size:9px;">${this.escapeHtml(this.translatePath(f.path))}</span>
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
      showNotification((i18n.getMessage('mergeFailed') || 'Merge failed: $1').replace('$1', error.message), 'error');
    }
  }

  /**
   * 打开文件夹
   */
  async openFolder(folderId) {
    try {
      await FolderOperations.openFolder(folderId);
    } catch (error) {
      showNotification((i18n.getMessage('openFailed') || 'Open failed: $1').replace('$1', error.message), 'error');
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
        this.buildDangerPreview(message, [{
          id: folder.id,
          title: folder.title,
          path: this.translatePath(folder.path),
          bookmarkCount: folder.bookmarkCount,
          subfolderCount: folder.subfolderCount
        }]),
        async () => {
          this.exportDangerBackup('delete-folder', [{
            id: folder.id,
            title: folder.title,
            path: this.translatePath(folder.path),
            bookmarkCount: folder.bookmarkCount,
            subfolderCount: folder.subfolderCount
          }]);
          await doDelete();
        }
      );
    } else {
      try {
        this.exportDangerBackup('delete-folder', [{
          id: folder.id,
          title: folder.title,
          path: this.translatePath(folder.path),
          bookmarkCount: folder.bookmarkCount,
          subfolderCount: folder.subfolderCount
        }]);
        await doDelete();
      } catch (error) {
        showNotification((i18n.getMessage('deleteFailed') || 'Delete failed: $1').replace('$1', error.message), 'error');
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
            <div class="folder-path">${this.escapeHtml(this.translatePath(folder.path))}</div>
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
                <span>${this.escapeHtml(this.translatePath(folder.path))} (${folder.bookmarkCount})</span>
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
    this.renderEmptyFoldersInSmart(); // 空文件夹合并到 Smart Tab
    this.renderCleanupSuggestions();
  }

  /**
   * 在 Smart Tab 中渲染空文件夹列表
   */
  renderEmptyFoldersInSmart() {
    const container = document.getElementById('emptyFoldersList');
    if (!container) return;

    // 过滤根文件夹
    var emptyFoldersToShow = [];
    for (var i = 0; i < this.emptyFolders.length; i++) {
      if (!this.hideRootFolders || !this.emptyFolders[i].isRoot) {
        emptyFoldersToShow.push(this.emptyFolders[i]);
      }
    }

    if (emptyFoldersToShow.length === 0) {
      container.innerHTML = `
        <div class="empty-state" id="emptyFoldersEmpty">
          <div class="empty-state-icon">🎉</div>
          <div class="empty-state-title">${i18n.getMessage('noEmptyFolders')}</div>
          <div class="empty-state-desc">${i18n.getMessage('noEmptyFoldersDesc') || 'Your bookmarks are well organized.'}</div>
        </div>`;
      return;
    }

    container.innerHTML = emptyFoldersToShow.map(folder => {
      const colorStyle = folder._color ? `border-left-color:${FolderColorService.getHex(folder._color)};` : '';
      return `
      <div class="folder-card compact" data-folder-id="${folder.id}" style="${colorStyle}">
        <div class="folder-card-header">
          <span class="folder-icon-display">📁</span>
          <div class="folder-header">
            <div class="folder-name">
              <span class="folder-title-text">${this.escapeHtml(folder.title)}</span>
            </div>
            <div class="folder-path">${this.escapeHtml(this.translatePath(folder.path))}</div>
          </div>
          <button class="btn btn-danger btn-sm" data-action="delete" data-folder-id="${folder.id}" style="margin-left:auto;">${i18n.getMessage('delete')}</button>
        </div>
      </div>`;
    }).join('');

    container.querySelectorAll('[data-action="delete"]').forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteFolder(e.target.dataset.folderId);
      });
    });
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
   * 扫描失效书签（委托 background Service Worker 执行，关闭弹窗后仍继续）
   */
  async scanBrokenBookmarks() {
    if (this._brokenScanTimer) return; // 已在扫描中

    const scanBtn = document.getElementById('scanBrokenBtn');
    const progressEl = document.getElementById('brokenCheckProgress');
    const fillEl = document.getElementById('brokenProgressFill');
    const countEl = document.getElementById('brokenProgressCount');

    // 权限检查/请求（必须在用户手势中）
    const hasHostAccess = await new Promise((resolve) => {
      chrome.permissions.contains({
        origins: ['http://*/*', 'https://*/*']
      }, resolve);
    });

    if (!hasHostAccess) {
      const granted = await new Promise((resolve) => {
        chrome.permissions.request({
          origins: ['http://*/*', 'https://*/*']
        }, resolve);
      });

      if (!granted) {
        showNotification(
          i18n.getMessage('hostPermissionRequired') || 'Site access is required to check bookmark status.',
          'warning'
        );
        return;
      }
    }

    // 通知 background 开始扫描并进入轮询
    this._isScanningBroken = true;
    this.renderBrokenBookmarks(); // 立即切换为「扫描中」状态
    if (scanBtn) {
      scanBtn.disabled = true;
      scanBtn.textContent = i18n.getMessage('checking') || 'Checking...';
    }
    if (progressEl) progressEl.classList.remove('hidden');
    if (fillEl) fillEl.style.width = '0%';
    if (countEl) countEl.textContent = '0 / 0';

    try {
      // 重试机制：MV3 Service Worker 可能被休眠，给其唤醒时间
      let lastError = null;
      for (let i = 0; i < 3; i++) {
        try {
          await chrome.runtime.sendMessage({ action: 'start-broken-scan' });
          lastError = null;
          break;
        } catch (e) {
          lastError = e;
          if (i < 2) await new Promise((r) => setTimeout(r, 300));
        }
      }
      if (lastError) throw lastError;
      this.startBrokenScanPolling();
    } catch (error) {
      console.error('Start broken scan failed:', error);
      this._isScanningBroken = false;
      showNotification((i18n.getMessage('scanFailed') || 'Scan failed: $1').replace('$1', error.message), 'error');
      if (scanBtn) {
        scanBtn.disabled = false;
        scanBtn.textContent = i18n.getMessage('scanBroken') || 'Scan';
      }
      if (progressEl) progressEl.classList.add('hidden');
    }
  }

  /**
   * 轮询后台扫描进度（弹窗打开期间）
   */
  startBrokenScanPolling() {
    if (this._brokenScanTimer) clearInterval(this._brokenScanTimer);
    this._brokenScanTimer = setInterval(async () => {
      try {
        let state = null;
        let lastErr = null;
        // SW 偶发未就绪，重试一次（弹窗关闭时也可忽略）
        for (let i = 0; i < 2; i++) {
          try {
            state = await chrome.runtime.sendMessage({ action: 'get-broken-scan-state' });
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e;
            if (i < 1) await new Promise((r) => setTimeout(r, 300));
          }
        }
        if (lastErr) return;
        if (!state) return;

        const fillEl = document.getElementById('brokenProgressFill');
        const countEl = document.getElementById('brokenProgressCount');
        if (fillEl && state.total) fillEl.style.width = `${Math.round((state.completed / state.total) * 100)}%`;
        if (countEl) countEl.textContent = `${state.completed} / ${state.total}`;

        if (state.status === 'done' || state.status === 'error') {
          this.stopBrokenScanPolling();
          this._isScanningBroken = false;
          const scanBtn = document.getElementById('scanBrokenBtn');
          const progressEl = document.getElementById('brokenCheckProgress');
          if (scanBtn) {
            scanBtn.disabled = false;
            scanBtn.textContent = i18n.getMessage('scanBroken') || 'Scan';
          }
          if (progressEl) progressEl.classList.add('hidden');

          if (state.status === 'error') {
            showNotification((i18n.getMessage('scanFailed') || 'Scan failed: $1').replace('$1', state.error || ''), 'error');
            return;
          }

          this.brokenBookmarks = state.broken || [];
          this.renderBrokenBookmarks();
          showNotification(
            (i18n.getMessage('scanComplete') || 'Scan complete: $1 broken, $2 valid')
              .replace('$1', this.brokenBookmarks.length)
              .replace('$2', state.validCount || 0),
            this.brokenBookmarks.length > 0 ? 'warning' : 'success'
          );
        }
      } catch (e) {
        // 弹窗关闭时 sendMessage 可能失败，忽略即可（后台扫描不受影响）
      }
    }, 400);
  }

  /**
   * 停止轮询
   */
  stopBrokenScanPolling() {
    if (this._brokenScanTimer) {
      clearInterval(this._brokenScanTimer);
      this._brokenScanTimer = null;
    }
  }

  /**
   * 弹窗打开时恢复后台扫描状态：进行中则继续轮询，已完成则直接展示结果
   */
  async restoreBrokenScanState() {
    try {
      let state = null;
      let lastErr = null;
      // SW 偶发未就绪，重试一次
      for (let i = 0; i < 2; i++) {
        try {
          state = await chrome.runtime.sendMessage({ action: 'get-broken-scan-state' });
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          if (i < 1) await new Promise((r) => setTimeout(r, 300));
        }
      }
      if (lastErr || !state) return;

      if (state.status === 'running') {
        const scanBtn = document.getElementById('scanBrokenBtn');
        const progressEl = document.getElementById('brokenCheckProgress');
        if (scanBtn) scanBtn.disabled = true;
        if (progressEl) progressEl.classList.remove('hidden');
        this._isScanningBroken = true;
        this.renderBrokenBookmarks();
        this.startBrokenScanPolling();
      } else if (state.status === 'done') {
        this.brokenBookmarks = state.broken || [];
        this.renderBrokenBookmarks();
      }
    } catch (e) {
      // 忽略
    }
  }

  /**
   * 渲染失效书签列表
   */
  renderBrokenBookmarks() {
    const container = document.getElementById('brokenBookmarksList');
    const actionsEl = document.getElementById('brokenBookmarksActions');

    if (this.brokenBookmarks.length === 0) {
      if (this._isScanningBroken) {
        // 扫描进行中：显示扫描状态，隐藏开始按钮
        container.innerHTML = `
          <div class="empty-state" id="brokenBookmarksEmpty">
            <div class="empty-state-icon">⏳</div>
            <div class="empty-state-title">${i18n.getMessage('scanningBroken') || 'Scanning in progress...'}</div>
            <div class="empty-state-desc">${i18n.getMessage('scanningBrokenDesc') || 'Checking bookmark status, please wait.'}</div>
          </div>`;
        actionsEl.classList.add('hidden');
        if (window.__refreshScrollbars) window.__refreshScrollbars();
        return;
      }
      container.innerHTML = `
        <div class="empty-state" id="brokenBookmarksEmpty">
          <div class="empty-state-icon">🔗</div>
          <div class="empty-state-title">${i18n.getMessage('noBrokenBookmarks') || 'Not scanned yet'}</div>
          <div class="empty-state-desc">${i18n.getMessage('noBrokenBookmarksDesc') || 'Click "Scan" to check for broken bookmarks.'}</div>
          <div class="empty-state-action">
            <button id="emptyStateScanBrokenJs" class="btn btn-primary btn-sm">${i18n.getMessage('startScan') || 'Start Scan'}</button>
          </div>
        </div>`;
      // 绑定扫描按钮
      const scanBtn = container.querySelector('#emptyStateScanBrokenJs');
      if (scanBtn) {
        scanBtn.addEventListener('click', () => {
          const btn = document.getElementById('scanBrokenBtn');
          if (btn) btn.click();
        });
      }
      actionsEl.classList.add('hidden');
      if (window.__refreshScrollbars) window.__refreshScrollbars();
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

    // 列表内容变化后刷新自定义滚动条
    if (window.__refreshScrollbars) window.__refreshScrollbars();
  }

  /**
   * 获取失效状态文本
   */
  getBrokenStatusText(status) {
    const map = {
      'broken': i18n.getMessage('statusBroken') || 'Broken',
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
      showNotification(i18n.getMessage('bookmarkDeleted') || 'Bookmark deleted', 'success');
    } catch (error) {
      showNotification((i18n.getMessage('deleteFailed') || 'Delete failed: $1').replace('$1', error.message), 'error');
    }
  }

  /**
   * 清理所有失效书签
   */
  async cleanBrokenBookmarks() {
    if (this.brokenBookmarks.length === 0) {
      showNotification(i18n.getMessage('noBrokenBookmarksToClean') || 'No broken bookmarks to clean', 'info');
      return;
    }

    const bookmarksToDelete = this.brokenBookmarks.map(bookmark => ({
      id: bookmark.id,
      title: bookmark.title,
      url: bookmark.url,
      path: this.translatePath(bookmark.path),
      status: bookmark.status,
      statusCode: bookmark.statusCode
    }));

    if (this.deleteConfirm) {
      this.showConfirmModal(
        i18n.getMessage('confirmCleanBroken') || 'Delete Broken Bookmarks',
        this.buildDangerPreview(
          (i18n.getMessage('confirmCleanBrokenMessage') || `Delete ${this.brokenBookmarks.length} broken bookmarks?`).replace('$1', this.brokenBookmarks.length),
          bookmarksToDelete
        ),
        async () => {
          this.exportDangerBackup('delete-broken-bookmarks', bookmarksToDelete);
          await this.doCleanBrokenBookmarks();
        }
      );
    } else {
      this.exportDangerBackup('delete-broken-bookmarks', bookmarksToDelete);
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
      showNotification((i18n.getMessage('cleanFailed') || 'Clean failed: $1').replace('$1', error.message), 'error');
    }
  }

  /**
   * 清空失效书签检测结果（仅清除列表，不删除书签）
   */
  async clearBrokenResults() {
    if (this.brokenBookmarks.length === 0) return;

    this.showConfirmModal(
      i18n.getMessage('clearBroken') || 'Clear Results',
      i18n.getMessage('confirmClearResults') || 'This will clear the scan results. Bookmarks will not be deleted.',
      () => {
        this.brokenBookmarks = [];
        this.renderBrokenBookmarks();
        if (window.__refreshScrollbars) window.__refreshScrollbars();
        // ★ 同步清除 storage 中的扫描状态，防止重开弹窗后恢复旧数据
        chrome.runtime.sendMessage({ action: 'clear-broken-scan-state' }, (resp) => {
          if (chrome.runtime.lastError) {
            // 后台偶发未就绪，忽略即可（内存已清空，下次扫描会覆盖）
            console.warn('clear-broken-scan-state failed:', chrome.runtime.lastError.message);
          }
        });
        showNotification(i18n.getMessage('resultsCleared') || 'Results cleared', 'info');
      }
    );
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
                <span class="duplicate-bookmark-path">${this.escapeHtml(this.translatePath(bookmark.path))}</span>
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
          <div class="empty-state-desc">${i18n.getMessage('noSuggestionsDesc') || 'Click scan to get cleanup suggestions.'}</div>
          <div class="empty-state-action">
            <button id="emptyStateRunAnalysisJs" class="btn btn-primary btn-sm">${i18n.getMessage('runAnalysis') || 'Run Analysis'}</button>
          </div>
        </div>`;
      // 绑定运行分析按钮
      const analysisBtn = container.querySelector('#emptyStateRunAnalysisJs');
      if (analysisBtn) {
        analysisBtn.addEventListener('click', () => {
          if (this._runCleanupSuggestions) {
            this._runCleanupSuggestions();
          }
        });
      }
      return;
    }
    
    container.innerHTML = this.cleanupSuggestions.map((suggestion, index) => {
      const isExpanded = suggestion._expanded;
      const displayFolders = isExpanded ? suggestion.folders : suggestion.folders.slice(0, 5);
      return `
      <div class="cleanup-suggestion-group priority-${suggestion.priority}">
        <div class="cleanup-suggestion-header">
          <span class="cleanup-suggestion-title">${i18n.getMessage(suggestion.type + 'Title') || suggestion.title}</span>
          <span class="cleanup-suggestion-count">${suggestion.count}</span>
        </div>
        <div class="cleanup-suggestion-desc">${i18n.getMessage(suggestion.type + 'Desc', suggestion.count) || suggestion.description}</div>
        <div class="cleanup-suggestion-folders">
          ${displayFolders.map(folder => `
            <div class="cleanup-suggestion-folder">
              <span class="folder-name">${this.escapeHtml(folder.title)}</span>
              <span class="folder-path">${this.escapeHtml(this.translatePath(folder.path))}</span>
            </div>
          `).join('')}
          ${suggestion.folders.length > 5 ? `
            <div class="more-items" data-action="toggle-suggestion" data-suggestion-index="${index}">
              ${isExpanded
                ? `↑ ${i18n.getMessage('collapse') || 'Collapse'}`
                : `+${suggestion.folders.length - 5} ${i18n.getMessage('more') || 'more'}`}
            </div>
          ` : ''}
        </div>
        <div class="cleanup-suggestion-actions">
          <button class="btn btn-sm ${suggestion.priority === 'high' ? 'btn-danger' : 'btn-secondary'}"
                  data-action="smart-action" data-suggestion-index="${index}">
            ${this.getSuggestionButtonText(suggestion.type)}
          </button>
        </div>
      </div>`;
    }).join('');

    // 绑定按钮事件
    container.querySelectorAll('[data-action="smart-action"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.suggestionIndex);
        this.executeSuggestionAction(this.cleanupSuggestions[index]);
      });
    });

    // 绑定展开/收起事件
    container.querySelectorAll('[data-action="toggle-suggestion"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.suggestionIndex);
        this.cleanupSuggestions[index]._expanded = !this.cleanupSuggestions[index]._expanded;
        this.renderCleanupSuggestions();
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
   * 运行清理建议分析
   */
  async _runCleanupSuggestions() {
    const accessData = await FolderAccessService.loadAccessData();
    this.cleanupSuggestions = SmartCleanupSuggestions.generateSuggestions(this.folders, this.duplicates, accessData);
    this.renderCleanupSuggestions();
    showNotification(i18n.getMessage('analysisComplete') || 'Analysis complete', 'success');
  }

  /**
   * 清理重复书签
   */
  async cleanDuplicateBookmarks() {
    if (this.duplicateBookmarks.length === 0) {
      showNotification(i18n.getMessage('noDuplicateBookmarksToClean') || 'No duplicate bookmarks to clean', 'info');
      return;
    }

    const bookmarksToDelete = this.getDuplicateBookmarksToDelete();
    
    if (this.deleteConfirm) {
      this.showConfirmModal(
        i18n.getMessage('confirmCleanDuplicates') || 'Clean Duplicate Bookmarks',
        this.buildDangerPreview(
          (i18n.getMessage('confirmCleanDuplicatesMessage') || `Delete ${bookmarksToDelete.length} duplicate bookmarks?`).replace('$1', bookmarksToDelete.length),
          bookmarksToDelete
        ),
        async () => {
          this.exportDangerBackup('delete-duplicate-bookmarks', bookmarksToDelete);
          await this.doCleanDuplicateBookmarks();
        }
      );
    } else {
      this.exportDangerBackup('delete-duplicate-bookmarks', bookmarksToDelete);
      await this.doCleanDuplicateBookmarks();
    }
  }
  
  async doCleanDuplicateBookmarks() {
    try {
      const keepIndices = this.getDuplicateKeepIndices();

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
      showNotification((i18n.getMessage('cleanFailed') || 'Clean failed: $1').replace('$1', error.message), 'error');
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
    const hideRootFoldersToggle = document.getElementById('hideRootFoldersToggle');
    if (hideRootFoldersToggle) {
      hideRootFoldersToggle.checked = this.hideRootFolders;
    }
    const actionPositionSelect = document.getElementById('actionPositionSelect');
    if (actionPositionSelect) {
      actionPositionSelect.value = this.actionPosition;
    }
    this.renderUndoHistory();
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
      showNotification(i18n.getMessage('noEmptyFoldersToClean') || 'No empty folders to clean', 'info');
      return;
    }

    const foldersToDelete = this.emptyFolders.map(folder => ({
      id: folder.id,
      title: folder.title,
      path: this.translatePath(folder.path)
    }));

    if (this.deleteConfirm) {
      this.showConfirmModal(
        i18n.getMessage('confirmDeleteAll'),
        this.buildDangerPreview(
          i18n.getMessage('confirmDeleteAllMessage').replace('$1', this.emptyFolders.length) || `Delete all ${this.emptyFolders.length} empty folders?`,
          foldersToDelete
        ),
        async () => {
          this.exportDangerBackup('delete-empty-folders', foldersToDelete);
          await this.doCleanAllEmpty();
        }
      );
    } else {
      this.exportDangerBackup('delete-empty-folders', foldersToDelete);
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
      showNotification(
        (i18n.getMessage('cleanEmptyResult') || 'Deleted $1 folders, $2 failed')
          .replace('$1', results.success)
          .replace('$2', results.failed),
        'success'
      );
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
      showNotification((i18n.getMessage('cleanFailed') || 'Clean failed: $1').replace('$1', error.message), 'error');
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

  showPromptModal({ title, message = '', defaultValue = '', placeholder = '' }) {
    return ModalService.showPrompt(this, { title, message, defaultValue, placeholder });
  }

  closePromptModal(value) {
    ModalService.closePrompt(this, value);
  }

  executePromptAction() {
    ModalService.executePrompt(this);
  }

  showInfoModal(title, message) {
    ModalService.showInfo(title, message);
  }

  closeInfoModal() {
    ModalService.closeInfo();
  }

  buildDangerPreview(message, items) {
    const safeItems = items || [];
    const preview = safeItems.slice(0, 5).map((item, index) => {
      const title = item.title || item.url || item.path || item.id || 'Unknown';
      const location = item.path ? ` (${item.path})` : '';
      return `${index + 1}. ${title}${location}`;
    }).join('\n');
    const more = safeItems.length > 5
      ? `\n${(i18n.getMessage('moreItems') || '+$1 more').replace('$1', safeItems.length - 5)}`
      : '';
    return `${message}\n\n${(i18n.getMessage('previewItems') || 'Items to be affected').replace('$1', safeItems.length)}\n${preview}${more}\n\n${i18n.getMessage('backupExportedBeforeDelete') || 'A backup JSON will be exported before deletion.'}`;
  }

  exportDangerBackup(action, items, extra = {}) {
    const date = new Date().toISOString().replace(/[:.]/g, '-');
    exportToJSON({
      version: '1.0',
      action,
      exportDate: new Date().toISOString(),
      items,
      ...extra
    }, `foldermark-${action}-${date}.json`);
  }

  getDuplicateKeepIndices() {
    const keepIndices = [];
    const container = document.getElementById('duplicateBookmarksList');

    this.duplicateBookmarks.forEach((group, groupIndex) => {
      const radios = container ? container.querySelectorAll(`input[name="keep-${groupIndex}"]`) : [];
      let keepIndex = 0;
      radios.forEach(radio => {
        if (radio.checked) {
          keepIndex = parseInt(radio.value);
        }
      });
      keepIndices.push(keepIndex);
    });

    return keepIndices;
  }

  getDuplicateBookmarksToDelete(keepIndices = this.getDuplicateKeepIndices()) {
    return this.duplicateBookmarks.flatMap((group, groupIndex) => {
      const keepIndex = keepIndices[groupIndex] || 0;
      return group.bookmarks
        .filter((_, index) => index !== keepIndex)
        .map(bookmark => ({
          ...bookmark,
          duplicateUrl: group.url
        }));
    });
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
      showNotification((i18n.getMessage('undoActionFailed') || 'Undo failed: $1').replace('$1', error.message), 'error');
    }
  }

  /**
   * 渲染撤销历史面板
   */
  renderUndoHistory() {
    const container = document.getElementById('undoHistoryList');
    if (!container) return;

    const history = UndoService.getHistory();
    if (history.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 16px;">
          <div class="empty-state-icon">📝</div>
          <div class="empty-state-title" style="font-size: 12px;">${i18n.getMessage('noUndoHistory') || 'No undo history'}</div>
        </div>
      `;
      return;
    }

    const formatTime = (timestamp) => {
      const d = new Date(timestamp);
      const locale = this.language === 'zh_CN' ? 'zh-CN' : (this.language === 'es' ? 'es-ES' : 'en-US');
      return d.toLocaleString(locale, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    container.innerHTML = history.map((entry, index) => `
      <div class="undo-history-item" data-index="${index}">
        <div class="undo-history-info">
          <span class="undo-history-desc">${this.escapeHtml(entry.description || 'Unknown')}</span>
          <span class="undo-history-time">${formatTime(entry.timestamp)}</span>
        </div>
        <button class="btn btn-secondary btn-xs undo-history-btn" data-index="${index}">${i18n.getMessage('undo') || 'Undo'}</button>
      </div>
    `).join('');

    // 绑定撤销按钮事件
    container.querySelectorAll('.undo-history-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        // 只撤销这一条记录
        const index = parseInt(btn.dataset.index);
        const entry = history[index];
        if (entry) {
          // 临时将这条记录放到栈顶，然后撤销
          UndoService._stack.push(entry);
          await this.executeUndo();
          this.renderUndoHistory();
        }
      });
    });
  }

  closeMergeModal() {
    document.getElementById('mergeModal').classList.add('hidden');
    this._mergeSourceId = null;
  }

  /**
   * 打开书签移动弹窗
   * @param {string} bookmarkId - 要移动的书签 ID
   * @param {string} sourceFolderId - 书签所在文件夹 ID
   */
  openMoveModal(bookmarkId, sourceFolderId) {
    this._moveBookmarkId = bookmarkId;
    this._moveSourceFolderId = sourceFolderId;
    this.renderMoveFolders(sourceFolderId);
    document.getElementById('moveModal').classList.remove('hidden');
  }

  /**
   * 渲染可移动到的目标文件夹列表（排除当前文件夹）
   * @param {string} sourceFolderId - 源文件夹 ID
   */
  async renderMoveFolders(sourceFolderId) {
    const listContainer = document.getElementById('moveFolderList');
    try {
      const folders = await BookmarkMover.getAvailableFolders();
      const targets = folders.filter(f => f.id !== sourceFolderId);
      if (targets.length === 0) {
        listContainer.innerHTML = `<div class="details-empty">${i18n.getMessage('noTargetFolder') || 'No target folder available'}</div>`;
        return;
      }
      listContainer.innerHTML = targets.map(f => `
        <div class="merge-folder-item" data-target-id="${f.id}">
          <strong>${this.escapeHtml(f.title)}</strong>
          <span style="color:var(--text-tertiary);font-size:9px;">${this.escapeHtml(f.path)}</span>
        </div>
      `).join('');
      listContainer.querySelectorAll('.merge-folder-item').forEach(item => {
        item.addEventListener('click', async () => {
          await this.executeMoveBookmark(item.dataset.targetId);
        });
      });
    } catch (error) {
      console.error('Render move folders failed:', error);
      listContainer.innerHTML = `<div class="details-empty">${(i18n.getMessage('operationFailed') || 'Operation failed') + ': ' + this.escapeHtml(error.message)}</div>`;
    }
  }

  /**
   * 执行书签移动
   * @param {string} targetId - 目标文件夹 ID
   */
  async executeMoveBookmark(targetId) {
    const bookmarkId = this._moveBookmarkId;
    const sourceFolderId = this._moveSourceFolderId;
    this.closeMoveModal();
    try {
      await BookmarkMover.moveBookmark(bookmarkId, targetId);
      showNotification(i18n.getMessage('bookmarkMoved') || 'Bookmark moved', 'success');
      // 刷新源文件夹详情，让书签消失
      if (sourceFolderId) {
        await this.renderFolderDetails(sourceFolderId);
      }
    } catch (error) {
      showNotification((i18n.getMessage('moveFailed') || 'Move failed: $1').replace('$1', error.message), 'error');
    }
  }

  closeMoveModal() {
    document.getElementById('moveModal').classList.add('hidden');
    this._moveBookmarkId = null;
    this._moveSourceFolderId = null;
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

  async toggleHideRootFolders(enabled) {
    this.hideRootFolders = enabled;
    await chrome.storage.local.set({ [STORAGE_KEYS.HIDE_ROOT_FOLDERS]: enabled });
    this.renderFolders();
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
        deleteConfirm: this.deleteConfirm,
        hideRootFolders: this.hideRootFolders,
        actionPosition: this.actionPosition
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
            if (data.settings.hideRootFolders !== undefined) {
              this.hideRootFolders = data.settings.hideRootFolders;
              const hideRootFoldersToggle = document.getElementById('hideRootFoldersToggle');
              if (hideRootFoldersToggle) hideRootFoldersToggle.checked = this.hideRootFolders;
              this.renderFolders();
            }
            if (data.settings.actionPosition !== undefined) {
              this.actionPosition = data.settings.actionPosition;
              const actionPositionSelect = document.getElementById('actionPositionSelect');
              if (actionPositionSelect) actionPositionSelect.value = this.actionPosition;
              this.renderFolders();
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
        [STORAGE_KEYS.THEME]: 'light',
        [STORAGE_KEYS.LANGUAGE]: 'en',
        [STORAGE_KEYS.DELETE_CONFIRM]: true,
        [STORAGE_KEYS.HIDE_ROOT_FOLDERS]: false
      };
      await chrome.storage.local.set(defaultSettings);
      this.theme = 'light';
      this.language = 'en';
      this.deleteConfirm = true;
      this.hideRootFolders = false;
      await theme.setTheme('light');
      await i18n.setLanguage('en');
      this.renderSettings();
      showNotification(i18n.getMessage('restoreSuccess') || 'Settings restored to defaults', 'success');
    } catch (error) {
      showNotification((i18n.getMessage('restoreFailed') || 'Restore failed: $1').replace('$1', error.message), 'error');
    }
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

  /**
   * 翻译路径中的 Chrome 系统根文件夹名称
   * 根据当前扩展语言将浏览器返回的本地化名称转为对应语言
   */
  translatePath(path) {
    if (!path || !path.trim()) return path;

    // Chrome 系统根文件夹名称映射表（key: 浏览器可能返回的原始名称 → value: 翻译后的名称）
    const translations = {
      'zh_CN': {
        '书签栏': '书签栏',
        '其他书签': '其他书签',
        '移动书签': '移动书签',
        // 英文浏览器下中文扩展可能遇到
        'Bookmarks Bar': '书签栏',
        'Other Bookmarks': '其他书签',
        'Mobile Bookmarks': '移动书签'
      },
      'en': {
        '书签栏': 'Bookmarks Bar',
        '其他书签': 'Other Bookmarks',
        '移动书签': 'Mobile Bookmarks',
        'Bookmarks Bar': 'Bookmarks Bar',
        'Other Bookmarks': 'Other Bookmarks',
        'Mobile Bookmarks': 'Mobile Bookmarks'
      }
    };

    var langMap = translations[this.language] || translations['en'];
    return path.split(' / ').map(function(segment) {
      return langMap[segment] || segment;
    }).join(' / ');
  }
}

/**
 * 自定义滚动条：隐藏原生滚动条后用 JS 驱动主题色滑块
 * 针对所有 .smart-list 容器（失效书签/空文件夹/清理建议）
 */
(function initCustomScrollbars() {
  // 全局只初始化一次
  if (window.__customScrollbarsReady) return;
  window.__customScrollbarsReady = true;

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function setupOne(scroller) {
    if (scroller.__customScrollbar) {
      if (scroller.__scrollUpdate) scroller.__scrollUpdate();
      return;
    }
    scroller.__customScrollbar = true;

    const bar = document.createElement('div');
    bar.className = 'custom-scrollbar';
    const thumb = document.createElement('div');
    thumb.className = 'custom-scrollbar-thumb';
    bar.appendChild(thumb);
    scroller.appendChild(bar);

    function update() {
      const trackH = scroller.clientHeight - 8;
      const scrollH = scroller.scrollHeight;
      const clientH = scroller.clientHeight;
      const ratio = clientH / scrollH;
      // 轨道随滚动抵消位移（绝对定位子元素会随内容一起滚动，需反向偏移保持固定）
      bar.style.height = Math.max(trackH, 4) + 'px';
      bar.style.top = (4 - scroller.scrollTop) + 'px';
      if (scrollH <= clientH + 2) {
        bar.style.display = 'none';
        return;
      }
      bar.style.display = 'block';
      const thumbH = clamp(trackH * 0.45, Math.floor(trackH * ratio), trackH * 0.6);
      thumb.style.height = thumbH + 'px';
      const maxScroll = scrollH - clientH;
      const maxThumb = trackH - thumbH;
      const top = maxScroll > 0 ? (scroller.scrollTop / maxScroll) * maxThumb : 0;
      thumb.style.top = top + 'px';
    }
    scroller.__scrollUpdate = update;

    scroller.addEventListener('scroll', () => {
      scroller.classList.add('scrolling');
      clearTimeout(scroller.__scrollTimer);
      scroller.__scrollTimer = setTimeout(() => scroller.classList.remove('scrolling'), 800);
      update();
    });

    // 拖拽滑块
    let dragging = false;
    let startY = 0;
    let startTop = 0;
    thumb.addEventListener('mousedown', (e) => {
      dragging = true;
      startY = e.clientY;
      startTop = parseFloat(thumb.style.top) || 0;
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const trackH = bar.clientHeight;
      const thumbH = thumb.offsetHeight;
      const maxThumb = trackH - thumbH;
      const maxScroll = scroller.scrollHeight - scroller.clientHeight;
      let newTop = clamp(startTop + (e.clientY - startY), 0, maxThumb);
      thumb.style.top = newTop + 'px';
      scroller.scrollTop = (newTop / maxThumb) * maxScroll;
    });
    document.addEventListener('mouseup', () => { dragging = false; });

    // 点击轨道跳转
    bar.addEventListener('mousedown', (e) => {
      if (e.target === thumb) return;
      const rect = bar.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const thumbH = thumb.offsetHeight;
      const maxThumb = bar.clientHeight - thumbH;
      const maxScroll = scroller.scrollHeight - scroller.clientHeight;
      const newTop = clamp(clickY - thumbH / 2, 0, maxThumb);
      scroller.scrollTop = (newTop / maxThumb) * maxScroll;
    });

    // 内容变化时刷新
    const ro = new ResizeObserver(() => update());
    ro.observe(scroller);

    requestAnimationFrame(update);
    return update;
  }

  function setupAll() {
    document.querySelectorAll('.smart-list').forEach(setupOne);
  }

  // 初次渲染后初始化（module 脚本在 DOMContentLoaded 之后才执行，需兼容两种状态）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(setupAll, 50));
  } else {
    setTimeout(setupAll, 50);
  }

  // 暴露给实例，供列表内容变化后调用
  window.__refreshScrollbars = setupAll;
})();

const app = new App();
