import { exec } from 'child_process';
import { promisify } from 'util';
import * as cheerio from 'cheerio';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { URL } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class WgetScraper {
  constructor() {
    this.tempDir = path.join(__dirname, '../temp/scrape');
  }

  async scrapeUrl(url) {
    await fs.ensureDir(this.tempDir);
    const filename = `scrape_${Date.now()}.html`;
    const downloadedFilePath = path.join(this.tempDir, filename);

    // Try multiple approaches to handle SSL/proxy issues
    const wgetCommands = [
      // First try: Standard wget with SSL fixes
      `wget --timeout=30 --tries=3 --user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36)" --no-check-certificate --secure-protocol=auto --https-only=off --max-redirect=5 --ignore-case --convert-links=off -O "${downloadedFilePath}" "${url}"`,
      
      // Second try: Disable proxy and use direct connection
      `env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY wget --timeout=30 --tries=3 --user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36)" --no-check-certificate --max-redirect=5 -O "${downloadedFilePath}" "${url}"`,
      
      // Third try: Force HTTP if possible
      `wget --timeout=30 --tries=3 --user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36)" --no-check-certificate --max-redirect=5 -O "${downloadedFilePath}" "${url.replace('https://', 'http://')}"`,
      
      // Fourth try: Use curl as fallback
      `curl -L --max-time 30 --retry 3 --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36" --insecure --max-redirs 5 -o "${downloadedFilePath}" "${url}"`
    ];

    let lastError = null;

    for (let i = 0; i < wgetCommands.length; i++) {
      try {
        console.log(`Scraping URL (attempt ${i + 1}/${wgetCommands.length}): ${url}`);
        await execAsync(wgetCommands[i]);
        
        // Check if file was successfully downloaded
        if (await fs.pathExists(downloadedFilePath)) {
          const stats = await fs.stat(downloadedFilePath);
          if (stats.size > 0) {
            console.log(`✅ Successfully scraped using method ${i + 1}`);
            break; // Success, exit the retry loop
          } else {
            await fs.remove(downloadedFilePath);
            throw new Error('Downloaded file is empty');
          }
        } else {
          throw new Error('Downloaded file does not exist');
        }
      } catch (error) {
        console.log(`❌ Method ${i + 1} failed: ${error.message}`);
        lastError = error;
        
        // Clean up any partial file
        if (await fs.pathExists(downloadedFilePath)) {
          await fs.remove(downloadedFilePath);
        }
        
        // Continue to next method
        continue;
      }
    }

    try {

      if (!await fs.pathExists(downloadedFilePath)) {
        throw lastError || new Error(`All download methods failed for URL: ${url}`);
      }

      const html = await fs.readFile(downloadedFilePath, 'utf-8');
      await fs.remove(downloadedFilePath); // Clean up immediately

      const $ = cheerio.load(html);
      const title = $('title').text().trim() || $('h1').first().text().trim() || 'Untitled';

      const images = [];
      const seenUrls = new Set();

      const addImage = (imgData) => {
        if (imgData.fullUrl && !seenUrls.has(imgData.fullUrl)) {
          images.push(imgData);
          seenUrls.add(imgData.fullUrl);
        }
      };

      $('img, [style*="background-image"]').each((i, elem) => {
        const $elem = $(elem);
        let src = $elem.is('img') ? ($elem.attr('src') || $elem.attr('data-src')) : '';
        
        if ($elem.css('background-image')) {
            const bgImg = $elem.css('background-image');
            if (bgImg && bgImg.includes('url(')) {
                src = bgImg.replace(/url\\((['"]?)(.*?)\\1\\)/, '$2');
            }
        }

        if (src && !src.startsWith('data:')) {
          try {
            const fullUrl = new URL(src, url).href;
            addImage({
              originalSrc: src,
              fullUrl: fullUrl,
              alt: $elem.attr('alt') || title,
            });
          } catch (e) {
            console.warn(`Could not resolve image URL: "${src}" on page ${url}`);
          }
        }
      });

      $('picture source').each((i, elem) => {
        const $source = $(elem);
        const srcset = $source.attr('srcset');
        if (srcset && !srcset.startsWith('data:')) {
          try {
            // Take the first URL from srcset as a representative image
            const firstSrc = srcset.split(',')[0].trim().split(' ')[0];
            const fullUrl = new URL(firstSrc, url).href;
            const alt = $source.parent().find('img').attr('alt') || title;
            addImage({
              originalSrc: firstSrc, // Use the specific src from srcset for replacement
              fullUrl: fullUrl,
              alt: alt,
            });
          } catch (e) {
            console.warn(`Could not resolve image URL from srcset: "${srcset}" on page ${url}`);
          }
        }
      });

      return {
        title,
        html: $.html(),
        images,
        url,
      };
    } catch (error) {
      console.error(`Error scraping ${url}:`, error);
      // Return a minimal HTML to avoid breaking the EPUB generation
      return {
        title: `Error: ${url}`,
        html: `<h1>Error</h1><p>Could not scrape content from ${url}</p><p>${error.message}</p>`,
        images: [],
        url,
      };
    }
  }

  async close() {
    try {
      if (await fs.pathExists(this.tempDir)) {
        await fs.remove(this.tempDir);
      }
    } catch (error) {
      console.warn('Failed to cleanup scraper temp directory:', error.message);
    }
  }
}

export default WgetScraper;
