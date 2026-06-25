/**
 * Theme - 主题管理
 * 支持深色模式和浅色模式
 */

class Theme {
  constructor() {
    this.currentTheme = 'system';
    this.rootElement = document.documentElement;
    this._mediaQuery = null;
  }

  /**
   * 初始化主题
   * @param {string} theme - 主题类型（light, dark, system）
   * @returns {Promise<void>}
   */
  async init(theme) {
    this.currentTheme = theme || 'system';
    await this.applyTheme();

    // 监听系统主题变化（避免重复绑定）
    if (window.matchMedia) {
      if (this._mediaQuery) {
        this._mediaQuery.removeEventListener('change', this._onSystemThemeChange);
      }
      this._mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this._onSystemThemeChange = () => {
        if (this.currentTheme === 'system') {
          this.applyTheme();
        }
      };
      this._mediaQuery.addEventListener('change', this._onSystemThemeChange);
    }
  }

  /**
   * 应用主题
   */
  async applyTheme() {
    let themeToApply = this.currentTheme;

    // 如果是系统主题，检测系统偏好
    if (themeToApply === 'system') {
      themeToApply = this.getSystemTheme();
    }

    // 设置 data-theme 属性
    this.rootElement.setAttribute('data-theme', themeToApply);
    
    // 保存到存储
    await this.saveTheme();
  }

  /**
   * 获取系统主题
   * @returns {string} 系统主题（light 或 dark）
   */
  getSystemTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  /**
   * 设置主题
   * @param {string} theme - 主题类型
   * @returns {Promise<void>}
   */
  async setTheme(theme) {
    this.currentTheme = theme;
    await this.applyTheme();
  }

  /**
   * 切换主题
   * @returns {Promise<string>} 新主题
   */
  async toggleTheme() {
    const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    await this.setTheme(newTheme);
    return newTheme;
  }

  /**
   * 获取当前主题
   * @returns {string} 当前主题
   */
  getTheme() {
    return this.currentTheme;
  }

  /**
   * 保存主题到存储
   * @returns {Promise<void>}
   */
  async saveTheme() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ 'foldermark_theme': this.currentTheme }, () => {
        resolve();
      });
    });
  }

  /**
   * 从存储加载主题
   * @returns {Promise<string>} 加载的主题
   */
  async loadTheme() {
    return new Promise((resolve) => {
      chrome.storage.local.get('foldermark_theme', (result) => {
        const theme = result['foldermark_theme'] || 'system';
        this.currentTheme = theme;
        resolve(theme);
      });
    });
  }
}

// 创建单例
const theme = new Theme();

export default theme;
