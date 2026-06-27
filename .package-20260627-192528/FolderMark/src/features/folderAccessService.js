/**
 * FolderAccessService - 文件夹访问统计服务
 * 跟踪文件夹的展开/访问次数和时间，用于智能清理建议
 */

const FOLDER_ACCESS_KEY = 'foldermark_folder_access';

class FolderAccessService {
  /**
   * 记录一次文件夹访问
   * @param {string} folderId - 文件夹 ID
   */
  static async recordAccess(folderId) {
    const data = await this.loadAccessData();
    if (!data[folderId]) {
      data[folderId] = { count: 0, firstAccess: Date.now(), lastAccess: 0 };
    }
    data[folderId].count++;
    data[folderId].lastAccess = Date.now();
    await this.saveAccessData(data);
  }

  /**
   * 获取文件夹访问数据
   * @param {string} folderId - 文件夹 ID
   * @returns {Promise<Object>} { count, firstAccess, lastAccess }
   */
  static async getAccessData(folderId) {
    const data = await this.loadAccessData();
    return data[folderId] || { count: 0, firstAccess: 0, lastAccess: 0 };
  }

  /**
   * 获取超过指定天数未访问的文件夹
   * @param {Array} folders - 文件夹列表
   * @param {number} days - 天数阈值（默认 180 天）
   * @returns {Array} 长期未用的文件夹
   */
  static async getUnusedFolders(folders, days = 180) {
    const data = await this.loadAccessData();
    const threshold = Date.now() - days * 24 * 60 * 60 * 1000;
    const unused = [];

    for (const folder of folders) {
      const access = data[folder.id];
      if (!access || !access.lastAccess || access.lastAccess < threshold) {
        // 从未访问或已超过阈值天数未访问
        unused.push({
          folder,
          daysSinceAccess: access && access.lastAccess
            ? Math.floor((Date.now() - access.lastAccess) / (24 * 60 * 60 * 1000))
            : -1 // -1 表示从未访问
        });
      }
    }

    return unused.sort((a, b) => b.daysSinceAccess - a.daysSinceAccess);
  }

  /**
   * 加载所有访问数据
   * @returns {Promise<Object>}
   */
  static async loadAccessData() {
    return new Promise((resolve) => {
      chrome.storage.local.get(FOLDER_ACCESS_KEY, (result) => {
        resolve(result[FOLDER_ACCESS_KEY] || {});
      });
    });
  }

  /**
   * 保存所有访问数据
   * @param {Object} data - 访问数据
   */
  static async saveAccessData(data) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [FOLDER_ACCESS_KEY]: data }, () => {
        resolve();
      });
    });
  }

  /**
   * 清除指定文件夹的访问数据（用于文件夹删除时清理）
   * @param {Array} folderIds - 文件夹 ID 数组
   */
  static async clearAccessData(folderIds) {
    const data = await this.loadAccessData();
    folderIds.forEach(id => delete data[id]);
    await this.saveAccessData(data);
  }
}

export default FolderAccessService;
