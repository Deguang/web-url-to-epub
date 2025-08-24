import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';

class SimpleScraper {
  constructor() {
    this.axiosConfig = {
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: function (status) {
        return status < 500; // Accept all status codes < 500 as success
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1'
      }
    };
  }

  async scrapeUrl(url, retries = 3) {
    let lastError;
    
    for (let i = 0; i < retries; i++) {
      try {
        console.log(`Scraping: ${url} (attempt ${i + 1}/${retries})`);
        
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 2000 * i));
        }
        
        const response = await axios.get(url, this.axiosConfig);
        
        console.log(`Response status: ${response.status}`);
        console.log(`Content type: ${response.headers['content-type']}`);
        console.log(`Content length: ${response.data.length}`);
        
        if (response.status !== 200) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const $ = cheerio.load(response.data);
        
        const title = $('title').text() || $('h1').first().text() || 'Untitled';
        
        console.log(`Extracted title: ${title}`);
        
        this.cleanHtml($);
        
        const images = await this.extractImages($, url);
        
        console.log(`Found ${images.length} images`);
        
        const processedHtml = $.html();
        
        console.log(`Processed HTML length: ${processedHtml.length}`);

        return {
          title: title.trim(),
          url,
          html: processedHtml,
          images
        };
      } catch (error) {
        lastError = error;
        console.error(`Attempt ${i + 1} failed for ${url}:`, error.message);
        if (error.response) {
          console.error(`Response status: ${error.response.status}`);
          console.error(`Response headers:`, error.response.headers);
        }
        
        if (i === retries - 1) {
          break;
        }
      }
    }
    
    console.error(`All ${retries} attempts failed for ${url}`);
    return {
      title: 'Error',
      url,
      html: `<h1>Failed to load content</h1><p>Error: ${lastError.message}</p><p>URL: ${url}</p>`,
      images: []
    };
  }

  cleanHtml($) {
    $('script').remove();
    $('style').remove();
    $('nav').remove();
    $('header').remove();
    $('footer').remove();
    $('.advertisement').remove();
    $('.ads').remove();
    $('.sidebar').remove();
    $('.menu').remove();
    $('[class*="ad-"]').remove();
    $('[id*="ad-"]').remove();
    
    $('*').each((i, elem) => {
      const $elem = $(elem);
      if ($elem.attr('style')) {
        $elem.removeAttr('style');
      }
      if ($elem.attr('class') && $elem.attr('class').includes('ad')) {
        $elem.remove();
      }
    });
  }

  async extractImages($, baseUrl) {
    const images = [];
    const baseUrlObj = new URL(baseUrl);
    
    $('img').each((i, elem) => {
      const $img = $(elem);
      let src = $img.attr('src') || $img.attr('data-src');
      
      if (src) {
        try {
          if (src.startsWith('//')) {
            src = baseUrlObj.protocol + src;
          } else if (src.startsWith('/')) {
            src = baseUrlObj.origin + src;
          } else if (!src.startsWith('http')) {
            src = new URL(src, baseUrl).href;
          }
          
          images.push({
            originalSrc: $img.attr('src') || $img.attr('data-src'),
            fullUrl: src,
            alt: $img.attr('alt') || ''
          });
        } catch (error) {
          console.warn(`Invalid image URL: ${src}`);
        }
      }
    });
    
    return images;
  }

  async close() {
    // No cleanup needed for HTTP-based scraper
  }
}

export default SimpleScraper;