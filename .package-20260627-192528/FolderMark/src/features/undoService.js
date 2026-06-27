/**
 * UndoService - 删除撤销服务
 * 在删除前快照文件夹树，支持撤销重建
 * 支持持久化到 chrome.storage
 */
import BookmarkService from '../core/bookmarkService.js';
import FolderColorService from './folderColorService.js';
import NotesService from './notesService.js';

const STORAGE_KEY = 'foldermark_undo_history';

class UndoService {
  // 撤销栈，最多保存 10 次操作
  static _stack = [];
  static _maxSize = 10;

  /**
   * 快照单个文件夹的完整树结构（删除前调用）
   * @param {string} folderId - 文件夹 ID
   * @returns {Promise<Object>} 快照 { title, parentId, children, color, note }
   */
  static async snapshot(folderId) {
    const nodes = await BookmarkService.getNode(folderId);
    if (!nodes || nodes.length === 0) return null;
    const folder = nodes[0];
    const children = await this._snapshotChildren(folderId);
    // 同时快照颜色和备注
    const color = await FolderColorService.getColor(folderId);
    const notes = await NotesService.loadNotes();
    const note = notes[folderId] || '';
    return {
      title: folder.title,
      parentId: folder.parentId,
      children,
      color: color || '',
      note,
    };
  }

  /**
   * 递归快照子节点
   * @param {string} nodeId
   * @returns {Promise<Array>} 子节点描述数组
   */
  static async _snapshotChildren(nodeId) {
    const children = await BookmarkService.getChildren(nodeId);
    return Promise.all(children.map(async (child) => {
      if (child.url) {
        // 书签
        return { type: 'bookmark', title: child.title, url: child.url };
      }
      // 子文件夹：递归快照
      return {
        type: 'folder',
        title: child.title,
        children: await this._snapshotChildren(child.id),
      };
    }));
  }

  /**
   * 初始化：从 storage 加载撤销历史
   */
  static async init() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY, (result) => {
        if (result[STORAGE_KEY] && Array.isArray(result[STORAGE_KEY])) {
          this._stack = result[STORAGE_KEY];
        }
        resolve();
      });
    });
  }

  /**
   * 保存撤销历史到 storage
   */
  static _save() {
    chrome.storage.local.set({ [STORAGE_KEY]: this._stack });
  }

  /**
   * 将快照推入撤销栈
   * @param {Array} snapshots - 快照数组（支持批量）
   * @param {string} description - 描述文本（用于 Toast 显示）
   */
  static push(snapshots, description) {
    this._stack.push({ snapshots, description, timestamp: Date.now() });
    if (this._stack.length > this._maxSize) this._stack.shift();
    this._save();
  }

  /**
   * 弹出并恢复最近一次删除
   * @returns {Promise<Object>} { restored: number, failed: number }
   */
  static async undo() {
    const entry = this._stack.pop();
    if (!entry) return { restored: 0, failed: 0 };

    let restored = 0;
    let failed = 0;

    for (const snap of entry.snapshots) {
      try {
        // 检查父文件夹是否还存在
        try {
          await BookmarkService.getNode(snap.parentId);
        } catch {
          // 父文件夹已被删除，无法恢复
          failed++;
          continue;
        }
        const newFolder = await this._restoreTree(snap.parentId, snap);
        // 恢复颜色和备注
        if (snap.color) {
          await FolderColorService.setColor(newFolder.id, snap.color);
        }
        if (snap.note) {
          const notes = await NotesService.loadNotes();
          notes[newFolder.id] = snap.note;
          await NotesService.saveNotes(notes);
        }
        restored++;
      } catch (err) {
        console.error('Undo restore failed:', err);
        failed++;
      }
    }

    // 保存更新后的栈到 storage
    this._save();

    return { restored, failed };
  }

  /**
   * 获取完整撤销历史
   * @returns {Array} 历史记录数组
   */
  static getHistory() {
    return this._stack.slice().reverse(); // 最新的在前面
  }

  /**
   * 清空撤销历史
   */
  static clearHistory() {
    this._stack = [];
    this._save();
  }

  /**
   * 在指定父文件夹下恢复一棵文件夹树
   * @param {string} parentId - 恢复到的父文件夹 ID
   * @param {Object} snap - 快照对象 { title, children }
   * @returns {Promise<Object>} 新建的文件夹节点
   */
  static async _restoreTree(parentId, snap) {
    const newFolder = await BookmarkService.createFolder(snap.title, parentId);
    await this._restoreChildren(newFolder.id, snap.children);
    return newFolder;
  }

  /**
   * 递归恢复子节点
   * @param {string} parentId
   * @param {Array} children
   */
  static async _restoreChildren(parentId, children) {
    for (const child of children) {
      if (child.type === 'bookmark') {
        await BookmarkService.createBookmark(child.title, child.url, parentId);
      } else {
        await this._restoreTree(parentId, child);
      }
    }
  }

  /**
   * 是否有可撤销的操作
   * @returns {boolean}
   */
  static canUndo() {
    return this._stack.length > 0;
  }

  /**
   * 获取最近一次操作的描述
   * @returns {string|null}
   */
  static getLastDescription() {
    if (this._stack.length === 0) return null;
    return this._stack[this._stack.length - 1].description;
  }

  /**
   * 清空撤销栈
   */
  static clear() {
    this._stack = [];
  }
}

export default UndoService;
