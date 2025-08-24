import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as cheerio from 'cheerio';
import WgetScraper from './WgetScraper.js';
import WgetImageDownloader from './WgetImageDownloader.js';
import EpubGen from 'epub-gen';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class EpubMaker {
  constructor(options = {}) {
    this.options = {
      title: 'Web Articles Collection',
      author: 'Web Scraper',
      language: 'en',
      outputDir: path.join(__dirname, '../output'),
      maxConcurrentUrls: 3, // 最大并发URL数
      maxConcurrentImages: 5, // 最大并发图片数
      batchSize: 5, // 批处理大小
      ...options
    };
    
    this.webScraper = new WgetScraper();
    this.imageDownloader = new WgetImageDownloader();
    this.processedCount = 0;
    this.totalCount = 0;
  }

  async createEpubFromUrls(urlList) {
    try {
      await fs.ensureDir(this.options.outputDir);
      await this.imageDownloader.init();

      this.totalCount = urlList.length;
      this.processedCount = 0;

      console.log(`🚀 Processing ${urlList.length} URLs with concurrent processing (max ${this.options.maxConcurrentUrls} concurrent)...`);
      
      const chapters = [];
      const allImages = [];

      // 并发处理URL
      const results = await this.processUrlsConcurrently(urlList);
      
      // 按原始顺序整理结果
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'fulfilled' && result.value) {
          const { chapter, images } = result.value;
          chapters.push(chapter);
          allImages.push(...images);
        } else {
          console.error(`❌ Failed to process URL ${i + 1}: ${result.reason?.message || 'Unknown error'}`);
          // 添加错误章节
          chapters.push({
            title: `Error: URL ${i + 1}`,
            data: `<h1>Error</h1><p>Could not process URL: ${urlList[i]}</p><p>${result.reason?.message || 'Unknown error'}</p>`,
            url: urlList[i]
          });
        }
      }

      await this.webScraper.close();

      const epubFilename = this.generateFilename();
      const epubPath = path.join(this.options.outputDir, epubFilename);

      console.log('\nGenerating EPUB...');
      console.log(`Total images collected: ${allImages.length}`);
      
      if (allImages.length > 0) {
        console.log(`Images embedded as base64 in HTML content`);
        console.log(`Image details:`);
        allImages.forEach((img, idx) => {
          console.log(`  ${idx + 1}. ${img.filename} (${img.alt || 'no alt'})`);
        });
      } else {
        console.log('No images found or processed');
      }

      // 🔧 新策略：让epub-gen正确处理图片而不是绕过它
      // epub-gen会扫描HTML中的src并在images数组中查找匹配的URL
      // 我们需要确保images数组中的URL与HTML中的base64 src匹配
      const imageFiles = [];
      for (const img of allImages) {
        if (await fs.pathExists(img.localPath)) {
          // 为每个base64图片创建对应的图片文件条目
          // 关键是要让epub-gen能找到匹配的图片
          const absolutePath = path.resolve(img.localPath);
          const stats = await fs.stat(absolutePath);
          
          imageFiles.push({
            url: absolutePath,  // epub-gen将使用这个路径读取文件
            alt: img.alt || 'Image',
            extension: path.extname(img.filename).toLowerCase().substring(1) || 'jpg',
            mediaType: this.getMimeType(img.filename)
          });
          
          console.log(`🔧 为epub-gen添加图片: ${absolutePath} (${stats.size} bytes)`);
        }
      }
      
      const epubOptions = {
        title: this.options.title,
        author: this.options.author,
        language: this.options.language,
        content: chapters,
        images: imageFiles,  // 提供图片给epub-gen让它正确处理
        output: epubPath,
        version: 3
      };
      
      console.log(`EPUB options prepared with ${imageFiles.length} image files for epub-gen`);

      await this.generateEpub(epubOptions);

      // 延迟清理临时文件，确保EPUB生成完成
      setTimeout(async () => {
        try {
          await this.imageDownloader.cleanup();
          console.log('Temporary files cleaned up');
        } catch (error) {
          console.warn('Error during cleanup:', error.message);
        }
      }, 10000); // 延长到10秒确保epub-gen完全处理完图片文件

      console.log(`\nEPUB generated successfully!`);
      console.log(`File: ${epubPath}`);
      console.log(`Size: ${await this.getFileSize(epubPath)}`);

      return epubPath;

    } catch (error) {
      console.error('Error creating EPUB:', error);
      await this.cleanup();
      throw error;
    }
  }

  async generateEpub(options) {
    return new Promise((resolve, reject) => {
      new EpubGen(options, options.output)
        .promise
        .then(() => {
          resolve();
        })
        .catch((error) => {
          reject(error);
        });
    });
  }

  generateFilename() {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    const title = this.options.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `${title}_${timestamp}.epub`;
  }

  async getFileSize(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const fileSizeInBytes = stats.size;
      const fileSizeInMB = (fileSizeInBytes / (1024 * 1024)).toFixed(2);
      return `${fileSizeInMB} MB`;
    } catch (error) {
      return 'Unknown size';
    }
  }

  replaceImagesWithPlaceholders(html) {
    const $ = cheerio.load(html);
    
    $('img').each((i, elem) => {
      const $img = $(elem);
      const alt = $img.attr('alt') || 'Image';
      const src = $img.attr('src') || '';
      $img.replaceWith(`<p><em>[${alt}]</em></p>`);
    });
    
    return $.html();
  }

  getMimeType(filename) {
    const extension = path.extname(filename).toLowerCase().substring(1);
    const mimeTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'bmp': 'image/bmp'
    };
    return mimeTypes[extension] || 'image/jpeg';
  }

  async processUrlsConcurrently(urlList) {
    const results = [];
    const { maxConcurrentUrls, batchSize } = this.options;
    
    // 使用较小的批处理和并发限制来避免资源耗尽
    const actualBatchSize = Math.min(batchSize, maxConcurrentUrls);
    
    for (let i = 0; i < urlList.length; i += actualBatchSize) {
      const batch = urlList.slice(i, i + actualBatchSize);
      console.log(`\n📦 Processing batch ${Math.floor(i / actualBatchSize) + 1}/${Math.ceil(urlList.length / actualBatchSize)} (${batch.length} URLs)`);
      
      const batchPromises = batch.map((url, batchIndex) => 
        this.processSingleUrl(url, i + batchIndex)
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);
      
      // 显示当前进度
      this.processedCount += batch.length;
      console.log(`✅ Batch completed. Progress: ${this.processedCount}/${this.totalCount} URLs processed`);
      
      // 在批次之间添加短暂延迟，避免过载
      if (i + actualBatchSize < urlList.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  }

  async processSingleUrl(url, urlIndex) {
    try {
      console.log(`\n🌐 [${urlIndex + 1}] Processing: ${url}`);
      const startTime = Date.now();
      
      const scrapedContent = await this.webScraper.scrapeUrl(url);
      const scrapeTime = Date.now() - startTime;
      
      let images = [];
      let processedHtml = scrapedContent.html;
      
      if (scrapedContent.images.length > 0) {
        console.log(`📷 [${urlIndex + 1}] Found ${scrapedContent.images.length} images - downloading...`);
        const imageStartTime = Date.now();
        
        const downloadedImages = await this.imageDownloader.downloadImages(
          scrapedContent.images, 
          urlIndex
        );
        
        const imageTime = Date.now() - imageStartTime;
        
        if (downloadedImages.length > 0) {
          processedHtml = await this.imageDownloader.replaceImageSources(
            processedHtml, 
            downloadedImages
          );
          
          images = downloadedImages;
          console.log(`✅ [${urlIndex + 1}] Successfully processed ${downloadedImages.length} images in ${imageTime}ms`);
        } else {
          console.log(`⚠️ [${urlIndex + 1}] No images were successfully downloaded, using placeholders`);
          processedHtml = this.replaceImagesWithPlaceholders(processedHtml);
        }
      }

      const chapter = {
        title: scrapedContent.title,
        data: processedHtml,
        url: scrapedContent.url
      };

      const totalTime = Date.now() - startTime;
      console.log(`🎉 [${urlIndex + 1}] Completed in ${totalTime}ms (scrape: ${scrapeTime}ms)`);

      return { chapter, images };
    } catch (error) {
      console.error(`❌ [${urlIndex + 1}] Error processing ${url}:`, error.message);
      throw error;
    }
  }

  async cleanup() {
    try {
      await this.webScraper.close();
      await this.imageDownloader.cleanup();
    } catch (error) {
      console.warn('Cleanup error:', error.message);
    }
  }
}

export default EpubMaker;