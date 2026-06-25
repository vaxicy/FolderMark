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
      contexts: ['page', 'browser_action']
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
      // 保存当前页面到书签
      if (tab && tab.url) {
        chrome.bookmarks.create({
          parentId: '1', // 书签栏
          title: tab.title || tab.url,
          url: tab.url
        }, (bookmark) => {
          if (chrome.runtime.lastError) {
            console.error('Save failed:', chrome.runtime.lastError);
          } else {
            console.log('Page saved to bookmarks:', bookmark);
          }
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
