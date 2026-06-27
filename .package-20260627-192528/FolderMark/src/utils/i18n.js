/**
 * I18n - 国际化工具
 * 提供多语言支持
 */

class I18n {
  constructor() {
    this.currentLanguage = 'en';
    this.messages = {};
  }

  /**
   * 初始化国际化
   * @param {string} language - 语言代码
   * @returns {Promise<void>}
   */
  async init(language) {
    this.currentLanguage = language || 'en';
    
    try {
      // 加载语言文件 - 使用 chrome.runtime.getURL 获取绝对路径
      const response = await fetch(chrome.runtime.getURL(`_locales/${this.currentLanguage}/messages.json`));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      this.messages = await response.json();
      
      // 应用翻译
      this.applyTranslations();
    } catch (error) {
      console.error('Load language file failed:', error);
      // 降级到英文
      if (this.currentLanguage !== 'en') {
        await this.init('en');
      }
    }
  }

  /**
   * 获取翻译文本
   * @param {string} key - 翻译键
   * @param {Object} substitutions - 替换参数
   * @returns {string} 翻译后的文本
   */
  getMessage(key, substitutions = null) {
    const message = this.messages[key];
    
    if (!message) {
      console.warn(`Translation key "${key}" not found`);
      return key;
    }
    
    let text = message.message;
    
    // 处理替换参数
    if (substitutions) {
      if (Array.isArray(substitutions)) {
        substitutions.forEach((sub, index) => {
          text = text.replace(`$${index + 1}`, sub);
        });
      } else {
        text = text.replace('$1', substitutions);
      }
    }
    
    return text;
  }

  /**
   * 应用翻译到 DOM
   */
  applyTranslations() {
    // 翻译 data-i18n 属性
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(element => {
      const key = element.getAttribute('data-i18n');
      const translation = this.getMessage(key);
      element.textContent = translation;
    });

    // 翻译 placeholder
    const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
    placeholderElements.forEach(element => {
      const key = element.getAttribute('data-i18n-placeholder');
      const translation = this.getMessage(key);
      element.placeholder = translation;
    });

    // 翻译 title
    const titleElements = document.querySelectorAll('[data-i18n-title]');
    titleElements.forEach(element => {
      const key = element.getAttribute('data-i18n-title');
      const translation = this.getMessage(key);
      element.title = translation;
    });
  }

  /**
   * 设置语言
   * @param {string} language - 语言代码
   * @returns {Promise<void>}
   */
  async setLanguage(language) {
    await this.init(language);
    
    // 保存到存储
    chrome.storage.local.set({ 'foldermark_language': language });
  }

  /**
   * 获取当前语言
   * @returns {string} 语言代码
   */
  getLanguage() {
    return this.currentLanguage;
  }
}

// 创建单例
const i18n = new I18n();

export default i18n;
