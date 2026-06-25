/**
 * BookmarkService - Chrome Bookmarks API 封装
 * 提供统一的书签操作接口
 */

class BookmarkService {
  /**
   * 新建文件夹
   * @param {string} title - 文件夹名称
   * @param {string} parentId - 父文件夹 ID（默认 '1' 为书签栏）
   * @returns {Promise<Object>} 新建的文件夹节点
   */
  static createFolder(title, parentId = '1') {
    return new Promise((resolve, reject) => {
      chrome.bookmarks.create({ title, parentId }, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
  }

  /**
   * 获取完整书签树
   * @returns {Promise<Array>} 书签树
   */
  static getBookmarkTree() {
    return new Promise((resolve, reject) => {
      chrome.bookmarks.getTree((bookmarkTreeNodes) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(bookmarkTreeNodes);
        }
      });
    });
  }

  /**
   * 获取指定文件夹的子节点
   * @param {string} folderId - 文件夹 ID
   * @returns {Promise<Array>} 子节点列表
   */
  static getChildren(folderId) {
    return new Promise((resolve, reject) => {
      chrome.bookmarks.getChildren(folderId, (children) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(children);
        }
      });
    });
  }

  /**
   * 获取指定节点信息
   * @param {string} nodeId - 节点 ID
   * @returns {Promise<Array>} 节点信息数组
   */
  static getNode(nodeId) {
    return new Promise((resolve, reject) => {
      chrome.bookmarks.get(nodeId, (nodes) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(nodes);
        }
      });
    });
  }

  /**
   * 更新书签节点
   * @param {string} nodeId - 节点 ID
   * @param {Object} changes - 更新内容 {title?, url?}
   * @returns {Promise<Object>} 更新后的节点
   */
  static updateNode(nodeId, changes) {
    return new Promise((resolve, reject) => {
      chrome.bookmarks.update(nodeId, changes, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
  }

  /**
   * 移动书签到目标文件夹
   * @param {string} bookmarkId - 书签 ID
   * @param {string} destinationFolderId - 目标文件夹 ID
   * @returns {Promise<Object>} 移动后的节点
   */
  static moveBookmark(bookmarkId, destinationFolderId) {
    return new Promise((resolve, reject) => {
      chrome.bookmarks.move(bookmarkId, { parentId: destinationFolderId }, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
  }

  /**
   * 删除节点（仅限空文件夹或书签）
   * @param {string} nodeId - 节点 ID
   * @returns {Promise<void>}
   */
  static removeNode(nodeId) {
    return new Promise((resolve, reject) => {
      chrome.bookmarks.remove(nodeId, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 递归删除文件夹（包括所有子节点）
   * @param {string} folderId - 文件夹 ID
   * @returns {Promise<void>}
   */
  static removeTree(folderId) {
    return new Promise((resolve, reject) => {
      chrome.bookmarks.removeTree(folderId, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 获取文件夹的完整路径
   * @param {string} folderId - 文件夹 ID
   * @returns {Promise<string>} 路径字符串
   */
  static async getFolderPath(folderId) {
    const path = [];
    let currentId = folderId;

    while (currentId) {
      const nodes = await this.getNode(currentId);
      if (nodes && nodes.length > 0) {
        const node = nodes[0];
        if (node.parentId) {
          path.unshift(node.title);
          currentId = node.parentId;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    return path.join(' / ') || 'Root';
  }

  /**
   * 搜索书签
   * @param {string} query - 搜索关键词
   * @returns {Promise<Array>} 搜索结果
   */
  static search(query) {
    return new Promise((resolve, reject) => {
      chrome.bookmarks.search(query, (results) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(results);
        }
      });
    });
  }
}

export default BookmarkService;
