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
import FolderOperations from '../src/features/folderOperations.js';
import NotesService from '../src/features/notesService.js';
import { STORAGE_KEYS, TABS, SORT_TYPES } from '../src/utils/constants.js';
import { formatDate, debounce, showNotification, exportToJSON } from '../src/utils/helpers.js';

class App {
  constructor() {
    this.currentTab = TABS.FOLDERS;
    this.folders = [];
    this.emptyFolders = [];
    this.duplicates = [];
    this.duplicateBookmarks = []; // 重复书签
    this.cleanupSuggestions = []; // 清理建议
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
      await this.scanBookmarks();
    } catch (error) {
      console.error('Initialization failed:', error);
      showNotification('Initialization failed: ' + error.message, 'error');
    }
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
  }

  /**
   * 快捷键处理
   */
  handleKeyboard(e) {
    // 忽略在输入框中的按键
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      return;
    }

    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        if (this.selectedFolderIds.size > 0) {
          e.preventDefault();
          this.batchDelete();
        }
        break;
      case 'F2':
        e.preventDefault();
        break;
      case 'a':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.toggleSelectAll(true);
          document.getElementById('selectAllCheckbox').checked = true;
        }
        break;
      case 'Escape':
        if (this.selectedFolderIds.size > 0) {
          e.preventDefault();
          this.clearSelection();
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
      
      // 扫描重复书签
      const bookmarkTree = await this.getBookmarkTree();
      this.duplicateBookmarks = DuplicateBookmarkDetector.detect(bookmarkTree);
      
      // 生成清理建议（传入已计算的 duplicates）
      this.cleanupSuggestions = SmartCleanupSuggestions.generateSuggestions(this.folders, this.duplicates);
      
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
  renderFolders() {
    const container = document.getElementById('foldersList');
    let folders = FolderScanner.searchFolders(this.folders, this.searchQuery);
    folders = FolderScanner.sortFolders(folders, this.currentSort);

    if (folders.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>' + i18n.getMessage('noFoldersFound') + '</p></div>';
      return;
    }

    container.innerHTML = folders.map(folder => this.createFolderCard(folder)).join('');
    this.bindFolderCardEvents();
    this.restoreSelectionState();
  }

  /**
   * 创建文件夹卡片 HTML（含复选框）
   */
  createFolderCard(folder) {
    const isSelected = this.selectedFolderIds.has(folder.id);
    const isEmpty = folder.isEmpty;
    return `
      <div class="folder-card ${isSelected ? 'selected' : ''}" data-folder-id="${folder.id}">
        <div class="folder-card-header">
          <label class="folder-checkbox">
            <input type="checkbox" data-folder-id="${folder.id}" ${isSelected ? 'checked' : ''}>
          </label>
          <div class="folder-header">
            <div>
              <div class="folder-name">
                <span class="folder-icon">📁</span>
                <span>${this.escapeHtml(folder.title)}</span>
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
      </div>
    `;
  }

  /**
   * 绑定文件夹卡片事件
   */
  bindFolderCardEvents() {
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
    const foldersList = document.getElementById('foldersList');
    if (foldersList) {
      foldersList.addEventListener('blur', (e) => {
        if (e.target.classList.contains('notes-input')) {
          const folderId = e.target.dataset.folderId;
          const note = e.target.value;
          this.saveFolderNote(folderId, note);
        }
      }, true);
    }
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
    
    showNotification(`Deleted ${success} folders${failed > 0 ? ', ' + failed + ' failed' : ''}`, 'success');
    this.clearSelection();
    await this.scanBookmarks();
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
   * 删除文件夹
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

    if (this.deleteConfirm) {
      this.showConfirmModal(
        i18n.getMessage('confirmDeleteTitle') || 'Confirm Delete',
        message,
        async () => {
          try {
            if (isEmpty) {
              await FolderOperations.deleteFolder(folderId, false, folder.isRoot);
            } else {
              await FolderOperations.deleteFolderTree(folderId, folder.isRoot);
            }
            showNotification('Folder deleted successfully', 'success');
            await this.scanBookmarks();
          } catch (error) {
            showNotification('Delete failed: ' + error.message, 'error');
          }
        }
      );
    } else {
      try {
        if (isEmpty) {
          await FolderOperations.deleteFolder(folderId, false, folder.isRoot);
        } else {
          await FolderOperations.deleteFolderTree(folderId, folder.isRoot);
        }
        showNotification('Folder deleted successfully', 'success');
        await this.scanBookmarks();
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
   * 渲染重复文件夹列表
   */
  renderDuplicates() {
    const container = document.getElementById('duplicatesList');
    if (this.duplicates.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎉</div>
          <div class="empty-state-title">${i18n.getMessage('noDuplicates')}</div>
          <div class="empty-state-desc">${i18n.getMessage('noDuplicatesDesc') || 'Your folder structure is very tidy.'}</div>
        </div>`;
      return;
    }

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

  /**
   * 渲染智能功能页面
   */
  renderSmartPage() {
    this.renderDuplicateBookmarks();
    this.renderCleanupSuggestions();
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
    
    container.innerHTML = this.duplicateBookmarks.map((group, index) => `
      <div class="duplicate-bookmark-group">
        <div class="duplicate-bookmark-header">
          <span class="duplicate-bookmark-url">${this.escapeHtml(group.url)}</span>
          <span class="duplicate-bookmark-count">${group.count} duplicates</span>
        </div>
        <div class="duplicate-bookmark-list">
          ${group.bookmarks.map((bookmark, idx) => `
            <div class="duplicate-bookmark-item ${idx === 0 ? 'keep' : ''}">
              <label class="duplicate-bookmark-checkbox">
                <input type="checkbox" data-group-index="${index}" data-bookmark-index="${idx}" ${idx === 0 ? 'checked disabled' : ''}>
              </label>
              <div class="duplicate-bookmark-info">
                <span class="duplicate-bookmark-title">${this.escapeHtml(bookmark.title)}</span>
                <span class="duplicate-bookmark-path">${this.escapeHtml(bookmark.path)}</span>
              </div>
              ${idx === 0 ? '<span class="keep-badge">Keep</span>' : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
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
          ${suggestion.folders.length > 5 ? `<div class="more-items">+${suggestion.folders.length - 5} more</div>` : ''}
        </div>
      </div>
    `).join('');
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
      const result = await DuplicateBookmarkDetector.removeDuplicates(this.duplicateBookmarks, 0);
      showNotification(
        `Deleted ${result.success} duplicate bookmarks${result.failed > 0 ? ', ' + result.failed + ' failed' : ''}`,
        'success'
      );
      if (result.errors.length > 0) {
        console.error('Clean duplicates errors:', result.errors);
      }
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
      const results = await EmptyFolderDetector.deleteAllEmptyFolders(this.emptyFolders);
      showNotification(`Deleted ${results.success} folders, ${results.failed} failed`, 'success');
      if (results.errors.length > 0) {
        console.error('Delete errors:', results.errors);
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

  exportStructure() {
    const data = {
      exportDate: new Date().toISOString(),
      totalFolders: this.folders.length,
      totalBookmarks: this.folders.reduce((sum, f) => sum + f.bookmarkCount, 0),
      emptyFolders: this.emptyFolders.length,
      duplicates: this.duplicates.length,
      folders: this.folders.map(f => ({
        name: f.title,
        path: f.path,
        bookmarkCount: f.bookmarkCount,
        subfolderCount: f.subfolderCount
      }))
    };
    exportToJSON(data, 'foldermark-structure.json');
    showNotification('Structure exported successfully', 'success');
  }

  importStructure() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          showNotification('Structure imported successfully', 'success');
          console.log('Imported data:', data);
        } catch (error) {
          showNotification('Import failed: Invalid file format', 'error');
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
