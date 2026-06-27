/**
 * FolderOperations - 文件夹操作器
 * 提供文件夹的重命名、删除、合并等操作
 */

import BookmarkService from '../core/bookmarkService.js';

class FolderOperations {
  /**
   * 新建文件夹（在书签栏根目录下）
   * @param {string} folderName - 文件夹名称
   * @returns {Promise<Object>} 新建的文件夹节点
   */
  static async createFolder(folderName) {
    try {
      if (!folderName || folderName.trim() === '') {
        throw new Error('Folder name cannot be empty');
      }
      // 在书签栏根目录（ID: '1'）下创建新文件夹
      const newFolder = await BookmarkService.createFolder(folderName.trim(), '1');
      return newFolder;
    } catch (error) {
      console.error('Create folder failed:', error);
      throw error;
    }
  }

  /**
   * 移动源文件夹中的所有书签到目标文件夹
   * @param {string} sourceFolderId - 源文件夹 ID
   * @param {string} targetFolderId - 目标文件夹 ID
   * @returns {Promise<Object>} 移动结果 {moved: number}
   */
  static async moveAllBookmarks(sourceFolderId, targetFolderId) {
    const results = {
      moved: 0,
      errors: []
    };

    try {
      // 获取源文件夹的内容
      const children = await BookmarkService.getChildren(sourceFolderId);

      // 移动所有子节点到目标文件夹
      for (const child of children) {
        try {
          await BookmarkService.moveBookmark(child.id, targetFolderId);
          results.moved++;
        } catch (error) {
          results.errors.push({
            node: child.title || 'Unknown',
            error: error.message
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Move all bookmarks failed:', error);
      throw new Error(`Failed to move bookmarks: ${error.message}`);
    }
  }

  /**
   * 合并文件夹（移动所有内容到目标文件夹）
   * @param {string} sourceFolderId - 源文件夹 ID
   * @param {string} targetFolderId - 目标文件夹 ID
   * @returns {Promise<Object>} 合并结果
   */
  static async mergeFolders(sourceFolderId, targetFolderId) {
    const results = {
      movedBookmarks: 0,
      movedFolders: 0,
      errors: []
    };

    try {
      const children = await BookmarkService.getChildren(sourceFolderId);

      for (const child of children) {
        try {
          await BookmarkService.moveBookmark(child.id, targetFolderId);

          if (child.children) {
            results.movedFolders++;
          } else {
            results.movedBookmarks++;
          }
        } catch (error) {
          results.errors.push({
            node: child.title || 'Unknown',
            error: error.message
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Merge folders failed:', error);
      throw new Error(`Failed to merge folders: ${error.message}`);
    }
  }

  /**
   * 重命名文件夹
   * @param {string} folderId - 文件夹 ID
   * @param {string} newName - 新名称
   * @returns {Promise<Object>} 更新后的文件夹信息
   */
  static async renameFolder(folderId, newName) {
    try {
      if (!newName || newName.trim() === '') {
        throw new Error('Folder name cannot be empty');
      }

      const trimmedName = newName.trim();

      if (trimmedName.includes('/') || trimmedName.includes('\\')) {
        throw new Error('Folder name cannot contain / or \\');
      }

      return await BookmarkService.updateNode(folderId, { title: trimmedName });
    } catch (error) {
      console.error('Rename folder failed:', error);
      throw error;
    }
  }

  /**
   * 删除文件夹
   * @param {string} folderId - 文件夹 ID
   * @param {boolean} recursive - 是否递归删除（包括子文件夹）
   * @param {boolean} isRoot - 是否为根级系统文件夹
   * @returns {Promise<void>}
   */
  static async deleteFolder(folderId, recursive = false, isRoot = false) {
    try {
      if (isRoot) {
        throw new Error('Cannot delete system root folders (Bookmarks Bar, Other Bookmarks, etc.)');
      }
      if (recursive) {
        await BookmarkService.removeTree(folderId);
      } else {
        const children = await BookmarkService.getChildren(folderId);
        if (children.length > 0) {
          throw new Error('Folder is not empty. Use recursive delete to remove all contents.');
        }
        await BookmarkService.removeNode(folderId);
      }
    } catch (error) {
      console.error('Delete folder failed:', error);
      throw error;
    }
  }

  /**
   * 递归删除文件夹（包括所有子项）
   * @param {string} folderId - 文件夹 ID
   * @param {boolean} isRoot - 是否为根级系统文件夹
   * @returns {Promise<void>}
   */
  static async deleteFolderTree(folderId, isRoot = false) {
    try {
      if (isRoot) {
        throw new Error('Cannot delete system root folders (Bookmarks Bar, Other Bookmarks, etc.)');
      }
      await BookmarkService.removeTree(folderId);
    } catch (error) {
      console.error('Delete folder tree failed:', error);
      throw error;
    }
  }

  /**
   * 复制文件夹路径到剪贴板
   * @param {string} folderId - 文件夹 ID
   * @returns {Promise<string>} 文件夹路径
   */
  static async copyFolderPath(folderId) {
    try {
      const path = await BookmarkService.getFolderPath(folderId);

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(path);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = path;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      return path;
    } catch (error) {
      console.error('Copy folder path failed:', error);
      throw error;
    }
  }

  /**
   * 打开文件夹中的所有书签
   * @param {string} folderId - 文件夹 ID
   * @param {number} maxTabs - 最大打开标签页数（默认 10）
   */
  static async openFolder(folderId, maxTabs = 10) {
    try {
      const children = await BookmarkService.getChildren(folderId);

      const bookmarks = children.filter(child => child.url);
      const bookmarksToOpen = bookmarks.slice(0, maxTabs);

      if (bookmarksToOpen.length === 0) {
        console.log('No bookmarks to open');
        return;
      }

      for (let i = 0; i < bookmarksToOpen.length; i++) {
        const bookmark = bookmarksToOpen[i];
        chrome.tabs.create({
          url: bookmark.url,
          active: i === 0
        });
      }

      console.log(`Opened ${bookmarksToOpen.length} bookmarks`);
    } catch (error) {
      console.error('Open folder failed:', error);
      throw error;
    }
  }

  /**
   * 获取文件夹信息
   * @param {string} folderId - 文件夹 ID
   * @returns {Promise<Object>} 文件夹信息
   */
  static async getFolderInfo(folderId) {
    try {
      const nodes = await BookmarkService.getNode(folderId);
      if (!nodes || nodes.length === 0) {
        throw new Error('Folder not found');
      }

      const node = nodes[0];
      const path = await BookmarkService.getFolderPath(folderId);
      const children = await BookmarkService.getChildren(folderId);

      const bookmarkCount = children.filter(child => child.url).length;
      const subfolderCount = children.filter(child => child.children).length;

      return {
        id: node.id,
        title: node.title,
        path: path,
        bookmarkCount: bookmarkCount,
        subfolderCount: subfolderCount,
        isEmpty: children.length === 0,
        dateGroupModified: node.dateGroupModified || 0
      };
    } catch (error) {
      console.error('Get folder info failed:', error);
      throw error;
    }
  }
}

export default FolderOperations;
