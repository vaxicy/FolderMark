/**
 * Helpers - 工具函数
 * 提供通用的辅助函数
 */

/**
 * 格式化日期
 * @param {number} timestamp - 时间戳
 * @returns {string} 格式化后的日期字符串
 */
export function formatDate(timestamp) {
  if (!timestamp) return 'Unknown';
  
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  // 小于一分钟
  if (diff < 60000) {
    return 'Just now';
  }
  
  // 小于一小时
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  }
  
  // 小于一天
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }
  
  // 小于一周
  if (diff < 604800000) {
    const days = Math.floor(diff / 86400000);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
  
  // 其他情况显示具体日期
  return date.toLocaleDateString();
}

/**
 * 防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {number} wait - 等待时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
export function debounce(func, wait = 300) {
  let timeout;
  
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * 显示通知
 * @param {string} message - 通知消息
 * @param {string} type - 通知类型（success, error, info）
 */
export function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // 自动消失
  setTimeout(() => {
    notification.classList.add('notification-hide');
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

/**
 * 安全地获取 DOM 元素
 * @param {string} id - 元素 ID
 * @returns {HTMLElement|null} DOM 元素
 */
export function safeGetElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    console.warn(`Element with id "${id}" not found`);
  }
  return element;
}

/**
 * 创建 DOM 元素
 * @param {string} tag - 标签名
 * @param {Object} attributes - 属性对象
 * @param {Array|string} children - 子元素或文本
 * @returns {HTMLElement} 创建的 DOM 元素
 */
export function createElement(tag, attributes = {}, children = null) {
  const element = document.createElement(tag);
  
  // 设置属性
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'className') {
      element.className = value;
    } else if (key === 'textContent') {
      element.textContent = value;
    } else if (key === 'innerHTML') {
      element.innerHTML = value;
    } else if (key.startsWith('on')) {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      element.setAttribute(key, value);
    }
  }
  
  // 添加子元素
  if (children) {
    if (Array.isArray(children)) {
      children.forEach(child => {
        if (typeof child === 'string') {
          element.appendChild(document.createTextNode(child));
        } else if (child instanceof HTMLElement) {
          element.appendChild(child);
        }
      });
    } else if (typeof children === 'string') {
      element.textContent = children;
    } else if (children instanceof HTMLElement) {
      element.appendChild(children);
    }
  }
  
  return element;
}

/**
 * 导出数据为 JSON 文件
 * @param {Object} data - 要导出的数据
 * @param {string} filename - 文件名
 */
export function exportToJSON(data, filename = 'bookmark-structure.json') {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  
  URL.revokeObjectURL(url);
}
