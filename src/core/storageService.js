/**
 * StorageService - Chrome Storage API 封装
 * 提供本地存储操作接口
 */

class StorageService {
  /**
   * 保存数据到本地存储
   * @param {Object} data - 要保存的数据
   * @returns {Promise<void>}
   */
  static save(data) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 从本地存储读取数据
   * @param {string|Array|Object} keys - 要读取的键
   * @returns {Promise<Object>} 读取的数据
   */
  static load(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
  }

  /**
   * 从本地存储删除数据
   * @param {string|Array} keys - 要删除的键
   * @returns {Promise<void>}
   */
  static remove(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(keys, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 清空本地存储
   * @returns {Promise<void>}
   */
  static clear() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.clear(() => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }
}

export default StorageService;
