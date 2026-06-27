/**
 * FolderMark - Background Service Worker
 * 右键菜单、快捷键处理
 */

// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  // 清除旧菜单
  chrome.contextMenus.removeAll(() => {
    // 打开 FolderMark
    chrome.contextMenus.create({
      id: 'openFolderMark',
      title: 'Open FolderMark',
      contexts: ['page', 'action']
    });

    // 分隔线
    chrome.contextMenus.create({
      id: 'separator1',
      type: 'separator',
      contexts: ['page']
    });

    // 保存当前页面到书签
    chrome.contextMenus.create({
      id: 'saveCurrentPage',
      title: 'Save current page to bookmarks',
      contexts: ['page']
    });
  });
});

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case 'openFolderMark':
      // 打开弹出窗口
      chrome.action.openPopup();
      break;
    
    case 'saveCurrentPage':
      // 保存页面信息到 storage，然后打开 popup 让用户选择目标文件夹
      const pageUrl = info.pageUrl || (tab && tab.url);
      if (pageUrl) {
        const pageInfo = {
          title: (tab && tab.title) || pageUrl,
          url: pageUrl,
          timestamp: Date.now()
        };
        chrome.storage.local.set({ foldermark_pending_save: pageInfo }, () => {
          // 打开弹出窗口
          chrome.action.openPopup();
        });
      }
      break;
  }
});

// 快捷键命令
chrome.commands.onCommand.addListener((command) => {
  switch (command) {
    case 'open-popup':
      chrome.action.openPopup();
      break;
  }
});
