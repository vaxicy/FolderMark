/**
 * FolderColorService - 文件夹颜色标签服务
 * 管理文件夹的颜色标记（存储在 chrome.storage.local）
 */

const FOLDER_COLOR_KEY = 'folderColors';

// 预设颜色列表
const COLOR_PRESETS = [
  { value: '', label: 'none', hex: null },
  { value: 'red', label: 'Red', hex: '#EF4444' },
  { value: 'orange', label: 'Orange', hex: '#F97316' },
  { value: 'yellow', label: 'Yellow', hex: '#EAB308' },
  { value: 'green', label: 'Green', hex: '#22C55E' },
  { value: 'blue', label: 'Blue', hex: '#3B82F6' },
  { value: 'purple', label: 'Purple', hex: '#A855F7' },
  { value: '__custom__', label: 'custom', hex: null },
];

class FolderColorService {
  /**
   * 获取所有文件夹颜色
   * @returns {Promise<Object>} { folderId: colorValue }
   */
  static async loadColors() {
    return new Promise((resolve) => {
      chrome.storage.local.get(FOLDER_COLOR_KEY, (result) => {
        resolve(result[FOLDER_COLOR_KEY] || {});
      });
    });
  }

  /**
   * 保存所有文件夹颜色
   * @param {Object} colors - { folderId: colorValue }
   * @returns {Promise<void>}
   */
  static async saveColors(colors) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [FOLDER_COLOR_KEY]: colors }, () => {
        resolve();
      });
    });
  }

  /**
   * 设置单个文件夹颜色
   * @param {string} folderId - 文件夹 ID
   * @param {string} color - 颜色值（空字符串表示清除）
   * @returns {Promise<void>}
   */
  static async setColor(folderId, color) {
    const colors = await this.loadColors();
    if (color) {
      colors[folderId] = color;
    } else {
      delete colors[folderId];
    }
    await this.saveColors(colors);
  }

  /**
   * 获取单个文件夹颜色
   * @param {string} folderId - 文件夹 ID
   * @returns {Promise<string>} 颜色值或空字符串
   */
  static async getColor(folderId) {
    const colors = await this.loadColors();
    return colors[folderId] || '';
  }

  /**
   * 按颜色筛选文件夹
   * @param {Array} folders - 文件夹列表
   * @param {string} color - 颜色值（空字符串表示不限）
   * @returns {Array} 筛选后的文件夹列表
   */
  static filterByColor(folders, color) {
    if (!color) return folders;
    const colors = {};
    // 同步读取（在调用前已加载）
    return folders.filter(f => f._color === color);
  }

  /**
   * 获取颜色预设列表
   * @returns {Array} 颜色预设
   */
  static getPresets() {
    return COLOR_PRESETS;
  }

  /**
   * 根据颜色值获取 hex
   * @param {string} value - 颜色值（预设名或 #RRGGBB 自定义颜色）
   * @returns {string|null} hex 颜色或 null
   */
  static getHex(value) {
    // 自定义颜色直接以 #RRGGBB 格式存储，直接返回
    if (value && value.startsWith('#')) {
      return value;
    }
    const preset = COLOR_PRESETS.find(p => p.value === value);
    return preset ? preset.hex : null;
  }
}

export default FolderColorService;
