import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class WgetImageDownloader {
  constructor() {
    this.tempDir = path.join(__dirname, '../temp/images');
    this.imageCache = new Map();
  }

  async init() {
    await fs.ensureDir(this.tempDir);
  }

  async downloadImages(images, urlIndex = 0) {
    if (!await fs.pathExists(this.tempDir)) {
      await this.init();
    }

    const downloadedImages = [];
    const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      
      try {
        if (this.imageCache.has(image.fullUrl)) {
          downloadedImages.push(this.imageCache.get(image.fullUrl));
          continue;
        }

        const url = new URL(image.fullUrl);
        let extension = path.extname(url.pathname).toLowerCase();
        
        if (!extension || !validExtensions.includes(extension)) {
          extension = '.jpg';
        }

        const filename = `image_${urlIndex}_${i}${extension}`;
        const filepath = path.join(this.tempDir, filename);

        console.log(`Downloading image with wget: ${image.fullUrl}`);

        // 使用wget下载图片
        const wgetCmd = [
          'wget',
          '--timeout=15',
          '--tries=2',
          '--user-agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"',
          '--no-check-certificate',
          '--quiet',
          `--output-document="${filepath}"`,
          `"${image.fullUrl}"`
        ].join(' ');

        try {
          await execAsync(wgetCmd);
          
          // 检查文件是否成功下载
          if (await fs.pathExists(filepath)) {
            const stats = await fs.stat(filepath);
            if (stats.size > 0) {
              const imageInfo = {
                originalSrc: image.originalSrc,
                fullUrl: image.fullUrl,
                localPath: filepath,
                filename: filename,
                alt: image.alt
              };

              this.imageCache.set(image.fullUrl, imageInfo);
              downloadedImages.push(imageInfo);
              
              console.log(`Downloaded: ${filename} (${stats.size} bytes)`);
            } else {
              console.warn(`Downloaded image is empty: ${filename}`);
              await fs.remove(filepath);
            }
          } else {
            console.warn(`Failed to download image: ${image.fullUrl}`);
          }
        } catch (wgetError) {
          console.warn(`wget failed for image ${image.fullUrl}:`, wgetError.message);
        }
      } catch (error) {
        console.warn(`Failed to process image ${image.fullUrl}:`, error.message);
      }
    }

    return downloadedImages;
  }

  async cleanup() {
    try {
      if (await fs.pathExists(this.tempDir)) {
        await fs.remove(this.tempDir);
      }
    } catch (error) {
      console.warn('Failed to cleanup temp directory:', error.message);
    }
  }

  async replaceImageSources(html, downloadedImages) {
    let processedHtml = html;
    
    for (const image of downloadedImages) {
      try {
        // 读取图片文件并转换为base64 - 这是最可靠的方法
        const imageBuffer = await fs.readFile(image.localPath);
        const extension = path.extname(image.filename).toLowerCase().substring(1);
        let mimeType = 'image/jpeg';
        
        switch (extension) {
          case 'png': mimeType = 'image/png'; break;
          case 'gif': mimeType = 'image/gif'; break;
          case 'jpg': case 'jpeg': mimeType = 'image/jpeg'; break;
          case 'webp': mimeType = 'image/webp'; break;
          case 'svg': mimeType = 'image/svg+xml'; break;
        }
        
        const base64Image = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
        
        // 转义特殊字符用于正则表达式
        const escapedSrc = image.originalSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // 替换所有可能的src属性格式
        const srcRegex = new RegExp(`src=["']${escapedSrc}["']`, 'gi');
        processedHtml = processedHtml.replace(srcRegex, `src="${base64Image}"`);
        
        // 替换 data-src 属性  
        const dataSrcRegex = new RegExp(`data-src=["']${escapedSrc}["']`, 'gi');
        processedHtml = processedHtml.replace(dataSrcRegex, `src="${base64Image}"`);
        
        // 处理相对路径的情况
        if (image.originalSrc.startsWith('/')) {
          const relativeRegex = new RegExp(`src=["']${image.originalSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'gi');
          processedHtml = processedHtml.replace(relativeRegex, `src="${base64Image}"`);
        }
        
        console.log(`Converted ${image.filename} to base64 (${(base64Image.length/1024).toFixed(1)}KB)`);
      } catch (error) {
        console.warn(`Failed to convert image ${image.filename} to base64:`, error.message);
        // 降级为占位符
        const escapedSrc = image.originalSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const srcRegex = new RegExp(`src=["']${escapedSrc}["']`, 'gi');
        processedHtml = processedHtml.replace(srcRegex, `alt="[${image.alt || 'Image'}]"`);
      }
    }
    
    return processedHtml;
  }
}

export default WgetImageDownloader;