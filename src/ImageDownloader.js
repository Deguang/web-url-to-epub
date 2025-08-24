import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ImageDownloader {
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

        console.log(`Downloading image: ${image.fullUrl}`);

        const response = await axios({
          method: 'GET',
          url: image.fullUrl,
          responseType: 'stream',
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        if (response.status === 200) {
          const writer = fs.createWriteStream(filepath);
          response.data.pipe(writer);

          await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
          });

          const imageInfo = {
            originalSrc: image.originalSrc,
            fullUrl: image.fullUrl,
            localPath: filepath,
            filename: filename,
            alt: image.alt
          };

          this.imageCache.set(image.fullUrl, imageInfo);
          downloadedImages.push(imageInfo);
          
          console.log(`Downloaded: ${filename}`);
        }
      } catch (error) {
        console.warn(`Failed to download image ${image.fullUrl}:`, error.message);
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

  replaceImageSources(html, downloadedImages) {
    let processedHtml = html;
    
    downloadedImages.forEach(image => {
      // 转义特殊字符用于正则表达式
      const escapedSrc = image.originalSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // 替换 src 属性
      const srcRegex = new RegExp(`src=["']${escapedSrc}["']`, 'gi');
      processedHtml = processedHtml.replace(srcRegex, `src="${image.filename}"`);
      
      // 替换 data-src 属性  
      const dataSrcRegex = new RegExp(`data-src=["']${escapedSrc}["']`, 'gi');
      processedHtml = processedHtml.replace(dataSrcRegex, `src="${image.filename}"`);
      
      // 处理相对路径的情况
      if (image.originalSrc.startsWith('/')) {
        const relativeRegex = new RegExp(`src=["']${image.originalSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'gi');
        processedHtml = processedHtml.replace(relativeRegex, `src="${image.filename}"`);
      }
    });
    
    return processedHtml;
  }
}

export default ImageDownloader;