/**
 * FolderScanner - 文件夹扫描器
 * 递归扫描书签树，收集文件夹信息
 */

import BookmarkService from './bookmarkService.js';

class FolderScanner {
  constructor() {
    this.folders = [];
    this.totalBookmarks = 0;
  }

  /**
   * 扫描完整书签树
   * @returns {Promise<Object>} 扫描结果
   */
  async scanAll() {
    this.folders = [];
    this.totalBookmarks = 0;

    try {
      const bookmarkTree = await BookmarkService.getBookmarkTree();

      // 从根节点开始扫描
      for (const rootNode of bookmarkTree) {
        if (rootNode.children) {
          for (const child of rootNode.children) {
            // 根级子文件夹是 Chrome 系统文件夹（书签栏、其他书签等），标记为 isRoot
            await this.scanNode(child, [], true);
          }
        }
      }

      return {
        folders: this.folders,
        totalFolders: this.folders.length,
        totalBookmarks: this.totalBookmarks
      };
    } catch (error) {
      console.error('Scan failed:', error);
      throw error;
    }
  }

  /**
   * 递归扫描节点
   * @param {Object} node - 书签节点
   * @param {Array} path - 当前路径
   * @param {boolean} isRoot - 是否为根级系统文件夹
   */
  async scanNode(node, path, isRoot = false) {
    if (node.children) {
      // 这是一个文件夹
      const currentPath = [...path, node.title];
      const folderInfo = {
        id: node.id,
        title: node.title,
        parentId: node.parentId || '0', // 父级文件夹 ID
        bookmarkCount: 0,
        subfolderCount: 0,
        path: currentPath.slice(0, -1).join(' / ') || 'Root',
        dateGroupModified: node.dateGroupModified || 0,
        isEmpty: node.children.length === 0,
        children: node.children,
        isRoot: isRoot  // 标记是否为 Chrome 系统根文件夹
      };

      // 统计书签和子文件夹
      for (const child of node.children) {
        if (child.children) {
          // 子文件夹
          folderInfo.subfolderCount++;
          await this.scanNode(child, currentPath, false);
        } else if (child.url) {
          // 书签
          folderInfo.bookmarkCount++;
          this.totalBookmarks++;
        }
      }

      this.folders.push(folderInfo);
    }
  }

  /**
   * 获取文件夹详情（用于展开查看）
   * @param {string} folderId - 文件夹 ID
   * @returns {Promise<Object>} 文件夹详情
   */
  static async getFolderDetails(folderId) {
    try {
      const children = await BookmarkService.getChildren(folderId);
      
      const bookmarks = [];
      const subfolders = [];

      for (const child of children) {
        if (child.children) {
          // 子文件夹
          const bookmarkCount = await this.countBookmarksInFolder(child.id);
          subfolders.push({
            id: child.id,
            title: child.title,
            bookmarkCount: bookmarkCount
          });
        } else if (child.url) {
          // 书签
          bookmarks.push({
            id: child.id,
            title: child.title,
            url: child.url
          });
        }
      }

      return {
        bookmarks,
        subfolders
      };
    } catch (error) {
      console.error('Get folder details failed:', error);
      throw error;
    }
  }

  /**
   * 统计文件夹内的书签数量（递归）
   * @param {string} folderId - 文件夹 ID
   * @returns {Promise<number>} 书签数量
   */
  static async countBookmarksInFolder(folderId) {
    try {
      const children = await BookmarkService.getChildren(folderId);
      let count = 0;

      for (const child of children) {
        if (child.url) {
          count++;
        } else if (child.children) {
          count += await this.countBookmarksInFolder(child.id);
        }
      }

      return count;
    } catch (error) {
      console.error('Count bookmarks failed:', error);
      return 0;
    }
  }

  /**
   * 搜索文件夹
   * @param {Array} folders - 文件夹列表
   * @param {string} query - 搜索关键词
   * @returns {Array} 匹配的文件夹
   */
  static searchFolders(folders, query) {
    const lowerQuery = query.toLowerCase().trim();
    
    if (!lowerQuery) {
      return folders;
    }

    return folders.filter(folder => {
      return folder.title.toLowerCase().includes(lowerQuery) ||
             folder.path.toLowerCase().includes(lowerQuery);
    });
  }

  /**
   * 排序文件夹
   * @param {Array} folders - 文件夹列表
   * @param {string} sortBy - 排序方式
   * @returns {Array} 排序后的文件夹
   */
  static sortFolders(folders, sortBy = 'name') {
    const sorted = [...folders];

    switch (sortBy) {
      case 'name':
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      
      case 'bookmarkCount':
        sorted.sort((a, b) => b.bookmarkCount - a.bookmarkCount);
        break;
      
      case 'path':
        sorted.sort((a, b) => a.path.localeCompare(b.path));
        break;
      
      case 'date':
        sorted.sort((a, b) => b.dateGroupModified - a.dateGroupModified);
        break;
      
      default:
        break;
    }

    return sorted;
  }
}

export default FolderScanner;
