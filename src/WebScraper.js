import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { URL } from 'url';

class WebScraper {
  constructor() {
    this.browser = null;
  }

  async init() {
    this.browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--disable-extensions',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ],
      protocolTimeout: 180000
    });
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async scrapeUrl(url) {
    if (!this.browser) {
      await this.init();
    }

    const page = await this.browser.newPage();
    
    try {
      console.log(`Scraping: ${url}`);
      
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      await page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });

      await page.waitForTimeout(2000);

      const content = await page.content();
      const title = await page.title();

      const $ = cheerio.load(content);
      
      this.cleanHtml($);
      
      const images = await this.extractImages($, url);
      
      const processedHtml = $.html();

      return {
        title: title || 'Untitled',
        url,
        html: processedHtml,
        images
      };
    } catch (error) {
      console.error(`Error scraping ${url}:`, error.message);
      return {
        title: 'Error',
        url,
        html: `<p>Failed to load content from ${url}</p>`,
        images: []
      };
    } finally {
      await page.close();
    }
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
}

export default WebScraper;