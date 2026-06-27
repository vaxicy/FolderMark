/**
 * IconGenerator - Canvas 图标生成器
 * 生成淡黄色文件夹风格图标
 */

class IconGenerator {
  /**
   * 生成文件夹图标
   * @param {number} size - 图标尺寸（16, 48, 128）
   * @returns {string} Data URL (PNG)
   */
  static generateFolderIcon(size = 128) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // 计算缩放比例
    const scale = size / 128;
    ctx.scale(scale, scale);

    // 绘制文件夹背景
    this.drawFolder(ctx, size);

    // 返回 Data URL
    return canvas.toDataURL('image/png');
  }

  /**
   * 绘制文件夹形状
   * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
   * @param {number} size - 原始尺寸
   */
  static drawFolder(ctx, size) {
    const width = 128;
    const height = 128;

    // 文件夹主体渐变（淡黄色）
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#FDE68A');  // 浅黄
    gradient.addColorStop(1, '#F59E0B');  // 深黄

    // 绘制文件夹主体
    ctx.fillStyle = gradient;
    ctx.strokeStyle = '#D97706';  // 橙色边框
    ctx.lineWidth = 4;

    // 文件夹形状路径
    ctx.beginPath();
    
    // 左上角（标签部分）
    ctx.moveTo(20, 40);
    ctx.lineTo(50, 40);
    ctx.quadraticCurveTo(55, 40, 55, 35);
    ctx.lineTo(75, 35);
    ctx.quadraticCurveTo(80, 35, 80, 40);
    ctx.lineTo(108, 40);
    
    // 右侧
    ctx.quadraticCurveTo(112, 40, 112, 44);
    ctx.lineTo(112, 95);
    
    // 底部
    ctx.quadraticCurveTo(112, 99, 108, 99);
    ctx.lineTo(20, 99);
    
    // 左侧
    ctx.quadraticCurveTo(16, 99, 16, 95);
    ctx.lineTo(16, 44);
    
    ctx.quadraticCurveTo(16, 40, 20, 40);
    ctx.closePath();

    ctx.fill();
    ctx.stroke();

    // 绘制高光效果
    const highlightGradient = ctx.createLinearGradient(0, 0, 0, height / 2);
    highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
    highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = highlightGradient;
    ctx.fill();

    // 绘制 "FM" 文字（FolderMark 缩写）
    ctx.fillStyle = '#78350F';  // 深棕色文字
    ctx.font = `bold ${size > 48 ? 36 : 14}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FM', width / 2, height / 2 + 10);
  }

  /**
   * 生成所有尺寸的图标
   * @returns {Object} 图标 Data URLs
   */
  static generateAllIcons() {
    return {
      '16': this.generateFolderIcon(16),
      '48': this.generateFolderIcon(48),
      '128': this.generateFolderIcon(128)
    };
  }

  /**
   * 将图标设置为扩展图标
   * @param {Object} icons - 图标 Data URLs
   */
  static async setExtensionIcons(icons) {
    try {
      // 将 Data URL 转换为 Blob
      const iconBlobs = {};
      
      for (const [size, dataUrl] of Object.entries(icons)) {
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        iconBlobs[size] = blob;
      }

      // 注意：Chrome 扩展 API 不支持动态设置图标
      // 需要先将图标保存到 storage 或 IndexedDB
      // 或者直接使用 <img> 标签显示
      
      console.log('Icons generated successfully', iconBlobs);
      return iconBlobs;
    } catch (error) {
      console.error('Set icons failed:', error);
    }
  }

  /**
   * 下载图标为 PNG 文件（用于手动安装）
   * @param {Object} icons - 图标 Data URLs
   */
  static downloadIcons(icons) {
    for (const [size, dataUrl] of Object.entries(icons)) {
      const link = document.createElement('a');
      link.download = `icon${size}.png`;
      link.href = dataUrl;
      link.click();
    }
  }
}

export default IconGenerator;
