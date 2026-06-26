/**
 * FolderIconService - 文件夹图标服务
 * 管理文件夹的自定义图标（存储在 chrome.storage.local）
 */

const FOLDER_ICON_KEY = 'foldermark_folder_icons';

// 预设图标列表（常用文件夹图标）
const ICON_PRESETS = [
  { value: '', label: 'none', icon: '📁' },          // 默认图标
  { value: '📂', label: 'openFolder', icon: '📂' },
  { value: '🗂️', label: 'cardFileBox', icon: '🗂️' },
  { value: '📊', label: 'chart', icon: '📊' },
  { value: '📝', label: 'memo', icon: '📝' },
  { value: '📌', label: 'pin', icon: '📌' },
  { value: '⭐', label: 'star', icon: '⭐' },
  { value: '🔖', label: 'bookmark', icon: '🔖' },
  { value: '🏠', label: 'home', icon: '🏠' },
  { value: '💼', label: 'briefcase', icon: '💼' },
  { value: '🎯', label: 'target', icon: '🎯' },
  { value: '🛠️', label: 'tools', icon: '🛠️' },
  { value: '📚', label: 'books', icon: '📚' },
  { value: '🎨', label: 'art', icon: '🎨' },
  { value: '🔧', label: 'wrench', icon: '🔧' },
  { value: '💡', label: 'idea', icon: '💡' },
  { value: '🎵', label: 'music', icon: '🎵' },
  { value: '🎬', label: 'movie', icon: '🎬' },
  { value: '⚡', label: 'lightning', icon: '⚡' },
  { value: '🔒', label: 'lock', icon: '🔒' },
  { value: '🌐', label: 'globe', icon: '🌐' },
  { value: '📧', label: 'email', icon: '📧' },
  { value: '🖼️', label: 'image', icon: '🖼️' },
  { value: '📹', label: 'video', icon: '📹' },
  { value: '🗃️', label: 'fileBox', icon: '🗃️' },
];

class FolderIconService {
  /**
   * 获取所有文件夹图标
   * @returns {Promise<Object>} { folderId: iconValue }
   */
  static async loadIcons() {
    return new Promise((resolve) => {
      chrome.storage.local.get(FOLDER_ICON_KEY, (result) => {
        resolve(result[FOLDER_ICON_KEY] || {});
      });
    });
  }

  /**
   * 保存所有文件夹图标
   * @param {Object} icons - { folderId: iconValue }
   * @returns {Promise<void>}
   */
  static async saveIcons(icons) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [FOLDER_ICON_KEY]: icons }, () => {
        resolve();
      });
    });
  }

  /**
   * 设置单个文件夹图标
   * @param {string} folderId - 文件夹 ID
   * @param {string} icon - 图标（空字符串表示清除）
   * @returns {Promise<void>}
   */
  static async setIcon(folderId, icon) {
    const icons = await this.loadIcons();
    if (icon) {
      icons[folderId] = icon;
    } else {
      delete icons[folderId];
    }
    await this.saveIcons(icons);
  }

  /**
   * 获取单个文件夹图标
   * @param {string} folderId - 文件夹 ID
   * @returns {Promise<string>} 图标或空字符串
   */
  static async getIcon(folderId) {
    const icons = await this.loadIcons();
    return icons[folderId] || '';
  }

  /**
   * 删除文件夹图标（用于文件夹删除时清理）
   * @param {Array} folderIds - 文件夹 ID 数组
   * @returns {Promise<void>}
   */
  static async deleteIcons(folderIds) {
    const icons = await this.loadIcons();
    folderIds.forEach(id => {
      delete icons[id];
    });
    await this.saveIcons(icons);
  }

  /**
   * 获取图标预设列表
   * @returns {Array} 图标预设
   */
  static getPresets() {
    return ICON_PRESETS;
  }

  /**
   * 根据图标值获取显示图标
   * @param {string} value - 图标值（emoji）
   * @returns {string} 图标 emoji 或默认图标
   */
  static getIconDisplay(value) {
    if (!value) return '📁'; // 默认图标
    return value;
  }
}

export default FolderIconService;
