/**
 * FolderMark - Notes Service
 * 文件夹备注管理服务
 */

import { STORAGE_KEYS } from '../utils/constants.js';

class NotesService {
  constructor() {
    this.notes = {};
    this.loaded = false;
  }

  /**
   * 加载所有备注
   */
  async loadNotes() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEYS.FOLDER_NOTES], (result) => {
        this.notes = result[STORAGE_KEYS.FOLDER_NOTES] || {};
        this.loaded = true;
        resolve(this.notes);
      });
    });
  }

  /**
   * 获取文件夹备注
   */
  async getNote(folderId) {
    if (!this.loaded) {
      await this.loadNotes();
    }
    return this.notes[folderId] || '';
  }

  /**
   * 保存文件夹备注
   */
  async saveNote(folderId, note) {
    if (!this.loaded) {
      await this.loadNotes();
    }

    if (note.trim() === '') {
      delete this.notes[folderId];
    } else {
      this.notes[folderId] = note.trim();
    }

    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEYS.FOLDER_NOTES]: this.notes }, () => {
        resolve();
      });
    });
  }

  /**
   * 删除文件夹备注
   */
  async deleteNote(folderId) {
    if (!this.loaded) {
      await this.loadNotes();
    }

    delete this.notes[folderId];

    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEYS.FOLDER_NOTES]: this.notes }, () => {
        resolve();
      });
    });
  }

  /**
   * 批量删除备注（用于文件夹删除时清理）
   */
  async deleteNotes(folderIds) {
    if (!this.loaded) {
      await this.loadNotes();
    }

    folderIds.forEach(id => {
      delete this.notes[id];
    });

    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEYS.FOLDER_NOTES]: this.notes }, () => {
        resolve();
      });
    });
  }
}

// 导出单例
export default new NotesService();
