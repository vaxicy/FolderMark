/**
 * EmptyFolderDetector - 空文件夹检测器
 * 检测并管理空文件夹
 */

import BookmarkService from '../core/bookmarkService.js';

class EmptyFolderDetector {
  /**
   * 从文件夹列表中检测空文件夹
   * @param {Array} folders - 文件夹列表
   * @returns {Array} 空文件夹列表
   */
  static detectFromList(folders) {
    return folders.filter(folder => folder.isEmpty && !folder.isRoot);
  }

  /**
   * 递归检测所有空文件夹（实时检测）
   * @returns {Promise<Array>} 空文件夹列表
   */
  static async detectRecursive() {
    const emptyFolders = [];
    await this.checkFolderRecursive('0', emptyFolders);

    // 过滤掉系统根文件夹（直接子节点 of '0'）
    try {
      const rootChildren = await BookmarkService.getChildren('0');
      const rootFolderIds = new Set(rootChildren.map(c => c.id));
      return emptyFolders.filter(f => !rootFolderIds.has(f.id));
    } catch (error) {
      console.error('Filter root folders failed:', error);
      return emptyFolders;
    }
  }

  /**
   * 递归检查文件夹
   * @param {string} folderId - 文件夹 ID
   * @param {Array} emptyFolders - 空文件夹列表（引用）
   */
  static async checkFolderRecursive(folderId, emptyFolders) {
    try {
      const children = await BookmarkService.getChildren(folderId);
      
      // 如果文件夹没有任何子节点，则是空文件夹
      if (children.length === 0 && folderId !== '0') {
        const nodeInfo = await BookmarkService.getNode(folderId);
        if (nodeInfo && nodeInfo.length > 0) {
          const path = await BookmarkService.getFolderPath(folderId);
          emptyFolders.push({
            id: folderId,
            title: nodeInfo[0].title,
            path: path,
            dateGroupModified: nodeInfo[0].dateGroupModified || 0
          });
        }
        return;
      }

      // 递归检查子文件夹
      for (const child of children) {
        if (child.children) {
          await this.checkFolderRecursive(child.id, emptyFolders);
        }
      }
    } catch (error) {
      console.error('Check folder failed:', error);
    }
  }

  /**
   * 删除单个空文件夹
   * @param {string} folderId - 文件夹 ID
   * @returns {Promise<void>}
   */
  static async deleteEmptyFolder(folderId) {
    try {
      // 再次确认文件夹为空
      const children = await BookmarkService.getChildren(folderId);
      if (children.length > 0) {
        throw new Error('Folder is not empty');
      }

      await BookmarkService.removeNode(folderId);
    } catch (error) {
      console.error('Delete empty folder failed:', error);
      throw error;
    }
  }

  /**
   * 删除所有空文件夹
   * @param {Array} emptyFolders - 空文件夹列表
   * @returns {Promise<Object>} 删除结果
   */
  static async deleteAllEmptyFolders(emptyFolders) {
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    // 按路径深度排序，先删除深层文件夹
    const sortedFolders = [...emptyFolders].sort((a, b) => {
      const depthA = a.path.split(' / ').length;
      const depthB = b.path.split(' / ').length;
      return depthB - depthA;
    });

    for (const folder of sortedFolders) {
      try {
        await this.deleteEmptyFolder(folder.id);
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          folder: folder.title,
          path: folder.path,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * 检查文件夹是否为空
   * @param {string} folderId - 文件夹 ID
   * @returns {Promise<boolean>} 是否为空
   */
  static async isFolderEmpty(folderId) {
    try {
      const children = await BookmarkService.getChildren(folderId);
      return children.length === 0;
    } catch (error) {
      console.error('Check folder empty failed:', error);
      return false;
    }
  }
}

export default EmptyFolderDetector;
