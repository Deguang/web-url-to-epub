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
      ...options
    };
    
    this.webScraper = new WgetScraper();
    this.imageDownloader = new WgetImageDownloader();
  }

  async createEpubFromUrls(urlList) {
    try {
      await fs.ensureDir(this.options.outputDir);
      await this.imageDownloader.init();

      console.log(`Processing ${urlList.length} URLs...`);
      
      const chapters = [];
      const allImages = [];

      for (let i = 0; i < urlList.length; i++) {
        const url = urlList[i];
        console.log(`\nProcessing ${i + 1}/${urlList.length}: ${url}`);

        const scrapedContent = await this.webScraper.scrapeUrl(url);
        
        if (scrapedContent.images.length > 0) {
          console.log(`Found ${scrapedContent.images.length} images - downloading...`);
          const downloadedImages = await this.imageDownloader.downloadImages(
            scrapedContent.images, 
            i
          );
          
          if (downloadedImages.length > 0) {
            scrapedContent.html = await this.imageDownloader.replaceImageSources(
              scrapedContent.html, 
              downloadedImages
            );
            
            allImages.push(...downloadedImages);
            console.log(`Successfully processed ${downloadedImages.length} images`);
          } else {
            console.log('No images were successfully downloaded, using placeholders');
            // 如果下载失败，替换为占位符
            scrapedContent.html = this.replaceImagesWithPlaceholders(scrapedContent.html);
          }
        }

        chapters.push({
          title: scrapedContent.title,
          data: scrapedContent.html,
          url: scrapedContent.url
        });
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

      // 图片已经作为base64嵌入HTML中，不需要单独传递给epub-gen
      const epubOptions = {
        title: this.options.title,
        author: this.options.author,
        language: this.options.language,
        content: chapters,
        output: epubPath,
        version: 3
      };
      
      console.log(`EPUB options prepared with ${allImages.length} images embedded as base64 in HTML`);

      await this.generateEpub(epubOptions);

      // 延迟清理临时文件，确保EPUB生成完成
      setTimeout(async () => {
        try {
          await this.imageDownloader.cleanup();
          console.log('Temporary files cleaned up');
        } catch (error) {
          console.warn('Error during cleanup:', error.message);
        }
      }, 5000); // 延长到5秒确保EPUB生成完成

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