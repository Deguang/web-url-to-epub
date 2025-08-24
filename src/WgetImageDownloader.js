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
    const maxConcurrent = 5; // 增加并发数以配合URL并发处理

    if (images.length === 0) {
      return downloadedImages;
    }

    console.log(`⚡ [URL-${urlIndex + 1}] 并发下载 ${images.length} 张图片 (max ${maxConcurrent} concurrent)`);
    
    // 创建下载任务函数
    const downloadImage = async (image, index) => {
      try {
        if (this.imageCache.has(image.fullUrl)) {
          return this.imageCache.get(image.fullUrl);
        }

        const url = new URL(image.fullUrl);
        let extension = path.extname(url.pathname).toLowerCase();
        
        if (!extension || !validExtensions.includes(extension)) {
          extension = '.jpg';
        }

        const filename = `image_${urlIndex}_${index}${extension}`;
        const filepath = path.join(this.tempDir, filename);

        // console.log(`⬇️  [${urlIndex + 1}] ${filename}: ${image.fullUrl}`); // 减少输出噪音

        const downloadCommands = [
          // First try: Standard wget with SSL fixes
          [
            'wget',
            '--timeout=30',
            '--tries=3',
            '--user-agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"',
            '--no-check-certificate',
            '--secure-protocol=auto',
            '--https-only=off',
            '--quiet',
            '--max-redirect=5',
            '--ignore-case',
            `--output-document="${filepath}"`,
            `"${image.fullUrl}"`
          ].join(' '),
          
          // Second try: Disable proxy
          `env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY wget --timeout=30 --tries=3 --user-agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36" --no-check-certificate --quiet --max-redirect=5 --output-document="${filepath}" "${image.fullUrl}"`,
          
          // Third try: Use curl
          `curl -L --max-time 30 --retry 3 --user-agent "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36" --insecure --max-redirs 5 --silent -o "${filepath}" "${image.fullUrl}"`
        ];

        let downloadSuccess = false;
        let lastError = null;

        for (let i = 0; i < downloadCommands.length && !downloadSuccess; i++) {
          try {
            await execAsync(downloadCommands[i]);
            
            // Check if download was successful
            if (await fs.pathExists(filepath)) {
              const stats = await fs.stat(filepath);
              if (stats.size > 0) {
                downloadSuccess = true;
                break;
              } else {
                await fs.remove(filepath);
              }
            }
          } catch (error) {
            lastError = error;
            // Clean up any partial file
            if (await fs.pathExists(filepath)) {
              await fs.remove(filepath);
            }
          }
        }

        if (!downloadSuccess) {
          throw lastError || new Error(`All download methods failed for ${image.fullUrl}`);
        }
        
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
            // console.log(`✅ [${urlIndex + 1}] ${filename} (${(stats.size/1024).toFixed(1)}KB)`); // 减少输出噪音
            return imageInfo;
          } else {
            console.warn(`❌ ${filename}: 文件为空`);
            await fs.remove(filepath);
          }
        }
      } catch (error) {
        // console.warn(`❌ [${urlIndex + 1}] 下载失败 ${image.fullUrl}:`, error.message); // 减少输出噪音
      }
      return null;
    };

    // 批量并发下载
    let processedImages = 0;
    for (let i = 0; i < images.length; i += maxConcurrent) {
      const batch = images.slice(i, i + maxConcurrent);
      const batchPromises = batch.map((image, batchIndex) => 
        downloadImage(image, i + batchIndex)
      );
      
      const results = await Promise.allSettled(batchPromises);
      let batchSuccessCount = 0;
      
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          downloadedImages.push(result.value);
          batchSuccessCount++;
        }
      });
      
      processedImages += batch.length;
      if (images.length > 5) { // 只有较多图片时才显示进度
        console.log(`📊 [URL-${urlIndex + 1}] 图片进度: ${processedImages}/${images.length} (成功: ${downloadedImages.length})`);
      }
    }

    if (downloadedImages.length > 0) {
      console.log(`✅ [URL-${urlIndex + 1}] 成功下载 ${downloadedImages.length}/${images.length} 张图片`);
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
    
    console.log(`🔄 替换 ${downloadedImages.length} 张图片的路径`);
    
    for (const image of downloadedImages) {
      try {
        const absolutePath = path.resolve(image.localPath);
        const escapedSrc = image.originalSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // 替换所有可能的src属性格式
        const srcRegex = new RegExp(`src=["']${escapedSrc}["']`, 'gi');
        processedHtml = processedHtml.replace(srcRegex, `src="${absolutePath}"`);
        
        const dataSrcRegex = new RegExp(`data-src=["']${escapedSrc}["']`, 'gi');
        processedHtml = processedHtml.replace(dataSrcRegex, `src="${absolutePath}"`);
        
        if (image.originalSrc.startsWith('/')) {
          const relativeRegex = new RegExp(`src=["']${image.originalSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'gi');
          processedHtml = processedHtml.replace(relativeRegex, `src="${absolutePath}"`);
        }
        
        const fullUrlRegex = new RegExp(`src=["']${image.fullUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'gi');
        processedHtml = processedHtml.replace(fullUrlRegex, `src="${absolutePath}"`);
        
      } catch (error) {
        console.warn(`❌ 处理图片失败 ${image.filename}:`, error.message);
      }
    }
    
    return processedHtml;
  }
}

export default WgetImageDownloader;