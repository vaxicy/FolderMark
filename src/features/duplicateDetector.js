/**
 * DuplicateDetector - 重复文件夹检测器
 * 检测同名或相似文件夹
 */

class DuplicateDetector {
  /**
   * 检测重复文件夹（按名称）
   * @param {Array} folders - 文件夹列表
   * @returns {Array} 重复文件夹组列表
   */
  static detect(folders) {
    const groups = {};

    // 按名称分组（不区分大小写）
    for (const folder of folders) {
      const normalizedName = folder.title.toLowerCase().trim();
      
      if (!groups[normalizedName]) {
        groups[normalizedName] = [];
      }
      
      groups[normalizedName].push(folder);
    }

    // 筛选出重复的组（同名文件夹数量 > 1）
    const duplicates = [];
    
    for (const [name, folderList] of Object.entries(groups)) {
      if (folderList.length > 1) {
        duplicates.push({
          id: `dup_${name}_${Date.now()}`,
          name: name,
          displayName: folderList[0].title,
          folders: folderList,
          count: folderList.length,
          similarity: this.analyzeSimilarity(folderList)
        });
      }
    }

    return duplicates;
  }

  /**
   * 高级检测：考虑路径相似度
   * @param {Array} folders - 文件夹列表
   * @returns {Array} 疑似重复的文件夹
   */
  static detectAdvanced(folders) {
    const duplicates = this.detect(folders);
    
    // 进一步分析：检查是否在相似路径下
    for (const group of duplicates) {
      group.recommendation = this.getRecommendation(group);
    }

    return duplicates;
  }

  /**
   * 分析文件夹相似度
   * @param {Array} folders - 文件夹列表
   * @returns {Object} 相似度分析
   */
  static analyzeSimilarity(folders) {
    const paths = folders.map(f => f.path);
    const bookmarkCounts = folders.map(f => f.bookmarkCount);
    
    return {
      commonParents: this.findCommonParents(paths),
      totalFolders: folders.length,
      totalBookmarks: bookmarkCounts.reduce((sum, count) => sum + count, 0),
      hasBookmarks: bookmarkCounts.some(count => count > 0)
    };
  }

  /**
   * 查找共同父路径
   * @param {Array} paths - 路径数组
   * @returns {Array} 共同父路径
   */
  static findCommonParents(paths) {
    if (paths.length < 2) return [];

    const pathPartsArray = paths.map(p => p.split(' / ').filter(part => part && part !== 'Root'));
    
    if (pathPartsArray.length < 2) return [];

    const first = pathPartsArray[0];
    const common = [];

    for (let i = 0; i < first.length; i++) {
      const part = first[i];
      let allHave = true;

      for (let j = 1; j < pathPartsArray.length; j++) {
        if (!pathPartsArray[j][i] || pathPartsArray[j][i] !== part) {
          allHave = false;
          break;
        }
      }

      if (allHave) {
        common.push(part);
      } else {
        break;
      }
    }

    return common;
  }

  /**
   * 获取处理建议
   * @param {Object} duplicateGroup - 重复组
   * @returns {Object} 建议
   */
  static getRecommendation(duplicateGroup) {
    const { folders } = duplicateGroup;
    
    // 找出书签最多的文件夹
    const folderWithMostBookmarks = folders.reduce((max, folder) => 
      folder.bookmarkCount > max.bookmarkCount ? folder : max
    );

    // 找出最新的文件夹
    const newestFolder = folders.reduce((max, folder) => 
      folder.dateGroupModified > max.dateGroupModified ? folder : max
    );

    return {
      keepFolder: folderWithMostBookmarks,
      reason: `Contains ${folderWithMostBookmarks.bookmarkCount} bookmarks`
    };
  }

  /**
   * 合并重复文件夹的建议
   * @param {Array} folders - 要合并的文件夹
   * @returns {Object} 合并建议
   */
  static getMergeSuggestion(folders) {
    if (folders.length < 2) {
      return null;
    }

    return {
      sourceFolder: folders[0],
      targetFolder: folders[1],
      bookmarksToMove: folders[0].bookmarkCount,
      subfoldersToMove: folders[0].subfolderCount
    };
  }
}

export default DuplicateDetector;
