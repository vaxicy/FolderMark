/**
 * TrashService - 回收站
 * 删除文件夹前把子树快照存起来，支持在设置页一键还原。
 * 保留 7 天 / 最多 20 条，避免占用过多本地存储。
 */
import BookmarkService from '../core/bookmarkService.js';
import UndoService from './undoService.js';

const STORAGE_KEY = 'foldermark_trash';
const MAX_ITEMS = 20;
const TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

class TrashService {
  /**
   * 读取回收站（自动清理过期条目）
   * @returns {Promise<Array>}
   */
  static async load() {
    const entries = await new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY, (result) => {
        resolve(Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : []);
      });
    });

    const now = Date.now();
    const fresh = entries.filter((entry) => now - (entry.ts || 0) < TTL);
    if (fresh.length !== entries.length) {
      await this._save(fresh);
    }
    return fresh;
  }

  /**
   * 写入回收站
   */
  static async _save(entries) {
    await new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: entries }, resolve);
    });
  }

  /**
   * 推入一批删除快照
   * @param {Array} snapshots - UndoService.snapshot 的结果数组
   * @param {string} description - 显示名称
   * @returns {Promise<Object|null>} 新条目
   */
  static async push(snapshots, description) {
    if (!Array.isArray(snapshots) || snapshots.length === 0) return null;

    const entries = await this.load();
    const entry = {
      id: `trash_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
      description: description || '',
      snapshots
    };
    entries.unshift(entry);
    if (entries.length > MAX_ITEMS) entries.length = MAX_ITEMS;
    await this._save(entries);
    return entry;
  }

  /**
   * 还原一条记录
   * @param {string} id
   * @returns {Promise<{restored: number, failed: number}>}
   */
  static async restore(id) {
    const entries = await this.load();
    const index = entries.findIndex((entry) => entry.id === id);
    if (index === -1) return { restored: 0, failed: 0 };

    const entry = entries[index];
    let restored = 0;
    let failed = 0;

    for (const snap of entry.snapshots) {
      try {
        // 原父文件夹可能也被删了，回退到「其他书签」
        let parentId = snap.parentId;
        const parent = await BookmarkService.getNode(parentId).catch(() => null);
        if (!parent || parent.length === 0) parentId = '2';

        await UndoService.restoreSnapshot(parentId, snap);
        restored++;
      } catch (err) {
        console.error('Trash restore failed:', err);
        failed++;
      }
    }

    entries.splice(index, 1);
    await this._save(entries);
    return { restored, failed };
  }

  /**
   * 移除一条记录（不还原）
   */
  static async remove(id) {
    const entries = await this.load();
    const next = entries.filter((entry) => entry.id !== id);
    await this._save(next);
  }

  /**
   * 清空回收站
   */
  static async clear() {
    await this._save([]);
  }
}

export default TrashService;
