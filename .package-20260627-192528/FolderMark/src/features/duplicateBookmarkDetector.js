/**
 * DuplicateBookmarkDetector - 重复书签检测
 * 检测书签中是否有重复的 URL
 */

class DuplicateBookmarkDetector {
  /**
   * 从书签树中检测重复书签
   * @param {Array} bookmarkTree - 书签树
   * @returns {Array} 重复书签分组
   */
  static detect(bookmarkTree) {
    const urlMap = new Map(); // URL -> 书签列表
    
    // 遍历书签树，收集所有书签
    this.traverseBookmarks(bookmarkTree, '', urlMap);
    
    // 找出重复的 URL
    const duplicates = [];
    for (const [url, bookmarks] of urlMap) {
      if (bookmarks.length > 1) {
        duplicates.push({
          url: url,
          count: bookmarks.length,
          bookmarks: bookmarks
        });
      }
    }
    
    // 按重复数量排序
    duplicates.sort((a, b) => b.count - a.count);
    
    return duplicates;
  }
  
  /**
   * 遍历书签树
   * @param {Array} nodes - 节点列表
   * @param {string} path - 当前路径
   * @param {Map} urlMap - URL 映射
   */
  static traverseBookmarks(nodes, path, urlMap) {
    for (const node of nodes) {
      const currentPath = path ? `${path} / ${node.title}` : node.title;
      
      if (node.url) {
        // 这是一个书签
        const url = node.url.toLowerCase().trim();
        if (!urlMap.has(url)) {
          urlMap.set(url, []);
        }
        urlMap.get(url).push({
          id: node.id,
          title: node.title,
          url: node.url,
          path: currentPath,
          parentId: node.parentId
        });
      }
      
      // 递归处理子节点
      if (node.children) {
        this.traverseBookmarks(node.children, currentPath, urlMap);
      }
    }
  }
  
  /**
   * 删除重复书签（保留第一个）
   * @param {Array} duplicates - 重复书签分组
   * @param {number} keepIndex - 保留的索引（默认 0，保留第一个）
   * @returns {Promise<Object>} 删除结果
   */
  static async removeDuplicates(duplicates, keepIndex = 0) {
    let success = 0;
    let failed = 0;
    const errors = [];
    
    for (const group of duplicates) {
      const bookmarksToDelete = group.bookmarks.filter((_, index) => index !== keepIndex);
      
      for (const bookmark of bookmarksToDelete) {
        try {
          await this.removeBookmark(bookmark.id);
          success++;
        } catch (error) {
          failed++;
          errors.push(`Failed to delete ${bookmark.title}: ${error.message}`);
        }
      }
    }
    
    return { success, failed, errors };
  }
  
  /**
   * 删除单个书签
   * @param {string} bookmarkId - 书签 ID
   * @returns {Promise<void>}
   */
  static removeBookmark(bookmarkId) {
    return new Promise((resolve, reject) => {
      chrome.bookmarks.remove(bookmarkId, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }
}

export default DuplicateBookmarkDetector;
