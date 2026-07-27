/**
 * FolderMark - Background Service Worker
 * 右键菜单、快捷键处理、失效书签后台扫描
 */

import BrokenBookmarkDetector from './src/features/brokenBookmarkDetector.js';

const BROKEN_SCAN_KEY = 'brokenScanState';

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

// ============ 失效书签后台扫描 ============
// 扫描在 Service Worker 中运行，关闭弹窗后继续，下次打开弹窗可读取进度/结果。

let _brokenScanCancel = false;

function saveState(state) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [BROKEN_SCAN_KEY]: state }, resolve);
  });
}

async function startBrokenScan() {
  _brokenScanCancel = false;
  let state = {
    status: 'running',   // running | done | error | idle
    completed: 0,
    total: 0,
    broken: [],
    validCount: 0,
    error: null,
    startedAt: Date.now(),
    finishedAt: null
  };
  await saveState(state);

  try {
    const tree = await chrome.bookmarks.getTree();
    const allBookmarks = BrokenBookmarkDetector.collectAllBookmarks(tree);
    state.total = allBookmarks.length;
    await saveState(state);

    if (allBookmarks.length === 0) {
      state.status = 'done';
    } else {
      let lastWrite = 0;
      const result = await BrokenBookmarkDetector.checkAllBookmarks(
        allBookmarks,
        async (completed, total) => {
          state.completed = completed;
          state.total = total;
          const now = Date.now();
          // 节流写入 storage，避免频繁小写入；最后一条总是写入
          if (now - lastWrite > 300 || completed === total) {
            lastWrite = now;
            await saveState(state);
          }
        },
        5
      );

      if (_brokenScanCancel) {
        state.status = 'idle';
      } else {
        state.broken = result.broken;
        state.validCount = result.valid.length;
        state.status = 'done';
      }
    }
    state.finishedAt = Date.now();
  } catch (err) {
    state.status = 'error';
    state.error = String((err && err.message) || err);
  }
  await saveState(state);
}

function cancelBrokenScan() {
  _brokenScanCancel = true;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.action) return;

  switch (msg.action) {
    case 'start-broken-scan':
      startBrokenScan();
      sendResponse({ ok: true });
      return true;

    case 'cancel-broken-scan':
      cancelBrokenScan();
      sendResponse({ ok: true });
      return true;

    case 'get-broken-scan-state':
      chrome.storage.local.get(BROKEN_SCAN_KEY, (res) => {
        sendResponse(res[BROKEN_SCAN_KEY] || null);
      });
      return true;
  }
});
