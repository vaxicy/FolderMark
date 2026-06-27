/**
 * BookmarkMover - 书签移动器
 * 支持选择书签并移动到其他文件夹
 */

import BookmarkService from '../core/bookmarkService.js';

class BookmarkMover {
  /**
   * 移动单个书签到目标文件夹
   * @param {string} bookmarkId - 书签 ID
   * @param {string} targetFolderId - 目标文件夹 ID
   * @returns {Promise<Object>} 移动后的书签
   */
  static async moveBookmark(bookmarkId, targetFolderId) {
    try {
      return await BookmarkService.moveBookmark(bookmarkId, targetFolderId);
    } catch (error) {
      console.error('Move bookmark failed:', error);
      throw error;
    }
  }

  /**
   * 批量移动书签到目标文件夹
   * @param {Array<string>} bookmarkIds - 书签 ID 数组
   * @param {string} targetFolderId - 目标文件夹 ID
   * @returns {Promise<Object>} 移动结果
   */
  static async moveBookmarks(batchmarkIds, targetFolderId) {
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    for (const bookmarkId of batchmarkIds) {
      try {
        await this.moveBookmark(bookmarkId, targetFolderId);
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          bookmarkId: bookmarkId,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * 获取所有文件夹（用于选择目标文件夹）
   * @returns {Promise<Array>} 文件夹列表
   */
  static async getAvailableFolders() {
    try {
      const bookmarkTree = await BookmarkService.getBookmarkTree();
      const folders = [];

      // 递归收集所有文件夹
      const collectFolders = (nodes, path = []) => {
        for (const node of nodes) {
          if (node.children) {
            const currentPath = [...path, node.title];
            folders.push({
              id: node.id,
              title: node.title,
              path: currentPath.join(' / '),
              hasChildren: node.children.some(child => child.children)
            });

            collectFolders(node.children, currentPath);
          }
        }
      };

      for (const rootNode of bookmarkTree) {
        if (rootNode.children) {
          collectFolders(rootNode.children);
        }
      }

      return folders;
    } catch (error) {
      console.error('Get available folders failed:', error);
      throw error;
    }
  }

  /**
   * 验证移动操作
   * @param {string} bookmarkId - 书签 ID
   * @param {string} targetFolderId - 目标文件夹 ID
   * @returns {Promise<Object>} 验证结果
   */
  static async validateMove(bookmarkId, targetFolderId) {
    try {
      // 检查目标文件夹是否存在
      const targetNodes = await BookmarkService.getNode(targetFolderId);
      if (!targetNodes || targetNodes.length === 0) {
        return {
          valid: false,
          error: 'Target folder not found'
        };
      }

      // 检查目标是否为文件夹
      if (!targetNodes[0].children) {
        return {
          valid: false,
          error: 'Target is not a folder'
        };
      }

      // 检查是否会形成循环（如果书签是文件夹）
      const bookmarkNodes = await BookmarkService.getNode(bookmarkId);
      if (bookmarkNodes && bookmarkNodes[0].children) {
        const isCircular = await this.checkCircularReference(bookmarkId, targetFolderId);
        if (isCircular) {
          return {
            valid: false,
            error: 'Circular reference detected'
          };
        }
      }

      return {
        valid: true,
        error: null
      };
    } catch (error) {
      console.error('Validate move failed:', error);
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * 检查循环引用
   * @param {string} folderId - 文件夹 ID
   * @param {string} targetFolderId - 目标文件夹 ID
   * @returns {Promise<boolean>} 是否有循环引用
   */
  static async checkCircularReference(folderId, targetFolderId) {
    try {
      let currentId = targetFolderId;

      while (currentId) {
        if (currentId === folderId) {
          return true;
        }

        const nodes = await BookmarkService.getNode(currentId);
        if (nodes && nodes.length > 0 && nodes[0].parentId) {
          currentId = nodes[0].parentId;
        } else {
          break;
        }
      }

      return false;
    } catch (error) {
      console.error('Check circular reference failed:', error);
      return false;
    }
  }
}

export default BookmarkMover;
