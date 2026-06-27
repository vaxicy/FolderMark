/**
 * BrokenBookmarkDetector - checks whether HTTP(S) bookmarks are reachable.
 */

class BrokenBookmarkDetector {
  /**
   * Collect all HTTP(S) bookmarks from a bookmark tree.
   * @param {Array} treeNodes
   * @param {string} path
   * @returns {Array} [{id, title, url, path}]
   */
  static collectAllBookmarks(treeNodes, path = '') {
    const bookmarks = [];

    for (const node of treeNodes) {
      if (node.url && /^https?:\/\//i.test(node.url)) {
        bookmarks.push({
          id: node.id,
          title: node.title || node.url,
          url: node.url,
          path: path || 'Root'
        });
      }

      if (node.children) {
        const childPath = path ? `${path} / ${node.title}` : node.title;
        bookmarks.push(...this.collectAllBookmarks(node.children, childPath));
      }
    }

    return bookmarks;
  }

  /**
   * Check one bookmark. Requires host permissions for the bookmark URL.
   * @param {Object} bookmark
   * @returns {Promise<Object>}
   */
  static async checkBookmark(bookmark) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      let response = await fetch(bookmark.url, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow',
        cache: 'no-store'
      });

      if (response.status === 405 || response.status === 501) {
        response = await fetch(bookmark.url, {
          method: 'GET',
          signal: controller.signal,
          redirect: 'follow',
          cache: 'no-store'
        });
      }

      clearTimeout(timeoutId);

      return {
        ...bookmark,
        status: response.ok || response.status < 400 ? 'valid' : 'broken',
        statusCode: response.status
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
        status,
        statusCode
      };
    }
  }

  /**
   * Check bookmarks in batches.
   * @param {Array} bookmarks
   * @param {Function|null} onProgress
   * @param {number} concurrency
   * @returns {Promise<Object>} {valid, broken, results}
   */
  static async checkAllBookmarks(bookmarks, onProgress = null, concurrency = 5) {
    const results = [];
    const broken = [];
    const valid = [];
    let completed = 0;

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
   * Delete broken bookmarks.
   * @param {Array} brokenBookmarks
   * @returns {Promise<Object>}
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
