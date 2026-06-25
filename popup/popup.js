/**
 * FolderMark - Popup Main Logic
 * 主交互逻辑
 */

import i18n from '../src/utils/i18n.js';
import theme from '../src/ui/theme.js';
import FolderScanner from '../src/core/scanner.js';
import EmptyFolderDetector from '../src/features/emptyFolderDetector.js';
import DuplicateDetector from '../src/features/duplicateDetector.js';
import FolderOperations from '../src/features/folderOperations.js';
import { STORAGE_KEYS, TABS, SORT_TYPES } from '../src/utils/constants.js';
import { formatDate, debounce, showNotification, exportToJSON } from '../src/utils/helpers.js';

class App {
  constructor() {
    this.currentTab = TABS.FOLDERS;
    this.folders = [];
    this.emptyFolders = [];
    this.duplicates = [];
    this.currentSort = SORT_TYPES.NAME;
    this.searchQuery = '';
    this._mergeSourceId = null; // 合并操作的源文件夹 ID
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

    // 搜索（使用 debounce）
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

    // 设置 - 导出
    document.getElementById('exportStructure').addEventListener('click', () => {
      this.exportStructure();
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

    // 确认弹窗 - 取消
    document.getElementById('modalCancel').addEventListener('click', () => {
      this.closeModal();
    });

    // 确认弹窗 - 确认
    document.getElementById('modalConfirm').addEventListener('click', () => {
      this.executeConfirmAction();
    });

    // 确认弹窗 - 点击遮罩关闭
    document.getElementById('confirmModal').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) {
        this.closeModal();
      }
    });

    // 合并弹窗 - 取消
    document.getElementById('mergeCancel').addEventListener('click', () => {
      this.closeMergeModal();
    });

    // 合并弹窗 - 点击遮罩关闭
    document.getElementById('mergeModal').addEventListener('click', (e) => {
      if (e.target.classList.contains('merge-modal-overlay')) {
        this.closeMergeModal();
      }
    });
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
      this.emptyFolders = EmptyFolderDetector.detectFromList(this.folders);
      this.duplicates = DuplicateDetector.detect(this.folders);
      this.updateStats();
      this.renderCurrentPage();
      this.showLoading(false);
    } catch (error) {
      console.error('Scan failed:', error);
      this.showLoading(false);
      showNotification('Scan failed: ' + error.message, 'error');
    }
  }

  /**
   * 切换 Tab
   */
  switchTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    document.querySelectorAll('.page').forEach(p => {
      p.classList.toggle('active', p.id === `${tab}Page`);
    });
    this.renderCurrentPage();
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
      case TABS.SETTINGS:
        this.renderSettings();
        break;
    }
  }

  /**
   * 渲染文件夹列表
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
  }

  /**
   * 创建文件夹卡片 HTML
   */
  createFolderCard(folder) {
    const isEmpty = folder.isEmpty;
    return `
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
      </div>
    `;
  }

  /**
   * 绑定文件夹卡片事件
   */
  bindFolderCardEvents() {
    document.querySelectorAll('[data-action]').forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = e.target.dataset.action;
        const folderId = e.target.dataset.folderId;
        this.handleFolderAction(action, folderId);
      });
    });
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
   * 合并文件夹 - 显示目标选择弹窗
   */
  async mergeFolder(folderId) {
    const sourceFolder = this.folders.find(f => f.id === folderId);
    if (!sourceFolder) return;

    // 过滤掉自身和空文件夹列表（可以合并到任何文件夹）
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

    // 绑定选择事件
    listContainer.querySelectorAll('.merge-folder-item').forEach(item => {
      item.addEventListener('click', async () => {
        const targetId = item.dataset.targetId;
        await this.executeMerge(folderId, targetId);
      });
    });

    document.getElementById('mergeModal').classList.remove('hidden');
  }

  /**
   * 执行合并：将源文件夹内容移动到目标文件夹
   */
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

  /**
   * 实际执行合并操作
   */
  async doMerge(sourceId, targetId) {
    try {
      const result = await FolderOperations.moveAllBookmarks(sourceId, targetId);
      // 合并后删除空源文件夹
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
   * 打开文件夹（在新标签页中打开所有书签）
   */
  async openFolder(folderId) {
    try {
      await FolderOperations.openFolder(folderId);
    } catch (error) {
      showNotification('Open failed: ' + error.message, 'error');
    }
  }

  /**
   * 删除文件夹（支持非空文件夹）
   */
  async deleteFolder(folderId) {
    const folder = this.folders.find(f => f.id === folderId);
    if (!folder) return;

    // 检查是否为 Chrome 系统根文件夹（书签栏、其他书签等）
    if (folder.isRoot) {
      showNotification(i18n.getMessage('cannotDeleteRoot') || 'Cannot delete system root folders (Bookmarks Bar, Other Bookmarks, etc.)', 'error');
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
      container.innerHTML = '<div class="empty-state"><p>' + i18n.getMessage('noEmptyFolders') + '</p></div>';
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
      container.innerHTML = '<div class="empty-state"><p>' + i18n.getMessage('noDuplicates') + '</p></div>';
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
    // 重新渲染当前页面以更新翻译
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

  showPrivacyInfo() {
    alert(i18n.getMessage('privacyMessage'));
  }

  showLoading(show) {
    const loading = document.getElementById('foldersLoading');
    if (loading) {
      loading.style.display = show ? 'flex' : 'none';
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// 启动应用
const app = new App();
