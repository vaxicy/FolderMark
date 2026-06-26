/**
 * SmartCleanupSuggestions - 智能清理建议
 * 分析文件夹使用频率，建议清理
 */

class SmartCleanupSuggestions {
  /**
   * 生成清理建议
   * @param {Array} folders - 文件夹列表
   * @param {Array} duplicates - 重复文件夹（可选）
   * @param {Object} accessData - 访问数据（可选，来自 FolderAccessService）
   * @returns {Array} 清理建议列表
   */
  static generateSuggestions(folders, duplicates = [], accessData = null) {
    const suggestions = [];
    
    // 1. 空文件夹建议（排除系统根文件夹）
    const emptyFolders = folders.filter(f => f.isEmpty && !f.isRoot);
    if (emptyFolders.length > 0) {
      suggestions.push({
        type: 'empty',
        priority: 'high',
        title: 'Empty Folders',
        description: `Found ${emptyFolders.length} empty folders that can be deleted`,
        count: emptyFolders.length,
        folders: emptyFolders
      });
    }
    
    // 2. 长时间未使用的文件夹（使用访问数据或 dateGroupModified）
    let unusedFolders = [];
    if (accessData) {
      // 使用访问数据
      const threshold = Date.now() - 180 * 24 * 60 * 60 * 1000;
      unusedFolders = folders.filter(f => {
        if (f.isEmpty || f.isRoot) return false;
        const access = accessData[f.id];
        if (!access || !access.lastAccess) return true; // 从未访问
        return access.lastAccess < threshold;
      });
    } else {
      // 回退到 dateGroupModified
      unusedFolders = folders.filter(f => {
        if (!f.dateGroupModified) return false;
        const daysSinceModified = (Date.now() - new Date(f.dateGroupModified).getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceModified > 180;
      });
    }
    if (unusedFolders.length > 0) {
      suggestions.push({
        type: 'unused',
        priority: 'medium',
        title: 'Unused Folders',
        description: `Found ${unusedFolders.length} folders not used in over 6 months`,
        count: unusedFolders.length,
        folders: unusedFolders.sort((a, b) => {
          // 按最后访问时间排序（从未访问的排最前）
          const aAccess = accessData && accessData[a.id] ? accessData[a.id].lastAccess : (a.dateGroupModified || 0);
          const bAccess = accessData && accessData[b.id] ? accessData[b.id].lastAccess : (b.dateGroupModified || 0);
          return aAccess - bAccess;
        })
      });
    }
    
    // 3. 书签数量少的文件夹（可以合并）
    const smallFolders = folders.filter(f => !f.isEmpty && f.bookmarkCount <= 2 && !f.isRoot);
    if (smallFolders.length > 1) {
      suggestions.push({
        type: 'small',
        priority: 'low',
        title: 'Small Folders',
        description: `Found ${smallFolders.length} folders with 2 or fewer bookmarks (consider merging)`,
        count: smallFolders.length,
        folders: smallFolders
      });
    }
    
    // 4. 重复文件夹（由外部传入）
    if (duplicates && duplicates.length > 0) {
      suggestions.push({
        type: 'duplicates',
        priority: 'high',
        title: 'Duplicate Folders',
        description: `Found ${duplicates.length} duplicate folder groups`,
        count: duplicates.length,
        folders: duplicates
      });
    }
    
    return suggestions;
  }
  
  /**
   * 计算文件夹的"健康分数"
   * @param {Object} folder - 文件夹
   * @returns {number} 分数（0-100，越高越好）
   */
  static calculateHealthScore(folder) {
    // 系统根文件夹不计入健康分数（始终满分）
    if (folder.isRoot) return 100;

    let score = 100;

    // 空文件夹扣分
    if (folder.isEmpty) {
      score -= 50;
    }
    
    // 长时间未使用扣分
    if (folder.dateGroupModified) {
      const daysSinceModified = (Date.now() - new Date(folder.dateGroupModified).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceModified > 365) {
        score -= 30;
      } else if (daysSinceModified > 180) {
        score -= 15;
      }
    }
    
    // 书签数量过少扣分
    if (folder.bookmarkCount <= 2) {
      score -= 10;
    }
    
    return Math.max(0, score);
  }
}

export default SmartCleanupSuggestions;
