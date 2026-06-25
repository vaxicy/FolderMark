/**
 * BrokenBookmarkDetector - 失效书签检测器
 * 通过 HEAD 请求检测书签是否有效
 */

class BrokenBookmarkDetector {
  /**
   * 收集所有书签（递归遍历书签树）
   * @param {Array} treeNodes - 书签树节点
   * @returns {Array} 书签列表 [{id, title, url, path}]
   */
  static collectAllBookmarks(treeNodes, path = '') {
    const bookmarks = [];

    for (const node of treeNodes) {
      if (node.url) {
        // 过滤掉非 HTTP(S) 的 URL（如 chrome://、javascript: 等）
        if (/^https?:\/\//i.test(node.url)) {
          bookmarks.push({
            id: node.id,
            title: node.title || node.url,
            url: node.url,
            path: path || 'Root'
          });
        }
      }
      if (node.children) {
        const childPath = path ? `${path} / ${node.title}` : node.title;
        bookmarks.push(...this.collectAllBookmarks(node.children, childPath));
      }
    }

    return bookmarks;
  }

  /**
   * 检测单个书签是否失效
   * @param {Object} bookmark - 书签对象
   * @returns {Promise<Object>} 检测结果
   */
  static async checkBookmark(bookmark) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(bookmark.url, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: controller.signal,
        redirect: 'follow'
      });
      clearTimeout(timeoutId);

      // no-cors 模式下 response.type 为 'opaque'，无法读取状态码
      // 能成功 fetch 就认为有效
      return {
        ...bookmark,
        status: 'valid',
        statusCode: null
      };
    } catch (error) {
      clearTimeout(timeoutId);
      let status = 'unknown';
      let statusCode = null;

      if (error.name === 'AbortError') {
        status = 'timeout';
      } else if (error.message && error.message.includes('Failed to fetch')) {
        status = 'unreachable';
      }

      return {
        ...bookmark,
        status: status,
        statusCode: statusCode
      };
    }
  }

  /**
   * 批量检测书签（带并发控制）
   * @param {Array} bookmarks - 书签列表
   * @param {Function} onProgress - 进度回调 (current, total, result)
   * @param {number} concurrency - 并发数
   * @returns {Promise<Object>} 检测结果 {valid, broken, results}
   */
  static async checkAllBookmarks(bookmarks, onProgress = null, concurrency = 5) {
    const results = [];
    const broken = [];
    const valid = [];
    let completed = 0;

    // 并发控制：分批处理
    for (let i = 0; i < bookmarks.length; i += concurrency) {
      const batch = bookmarks.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(bookmark => this.checkBookmark(bookmark))
      );

      for (const result of batchResults) {
        completed++;
        results.push(result);

        if (result.status === 'valid') {
          valid.push(result);
        } else {
          broken.push(result);
        }

        if (onProgress) {
          onProgress(completed, bookmarks.length, result);
        }
      }
    }

    return { valid, broken, results };
  }

  /**
   * 删除失效书签
   * @param {Array} brokenBookmarks - 失效书签列表
   * @returns {Promise<Object>} 删除结果
   */
  static async removeBrokenBookmarks(brokenBookmarks) {
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    for (const bookmark of brokenBookmarks) {
      try {
        await new Promise((resolve, reject) => {
          chrome.bookmarks.remove(bookmark.id, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve();
            }
          });
        });
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          bookmark: bookmark.title,
          url: bookmark.url,
          error: error.message
        });
      }
    }

    return results;
  }
}

export default BrokenBookmarkDetector;
