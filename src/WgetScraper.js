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
    this.tempDir = path.join(__dirname, '../temp/wget');
  }

  async init() {
    await fs.ensureDir(this.tempDir);
  }

  async scrapeUrl(url, retries = 3) {
    let lastError;
    
    if (!await fs.pathExists(this.tempDir)) {
      await this.init();
    }
    
    for (let i = 0; i < retries; i++) {
      try {
        console.log(`Scraping with wget: ${url} (attempt ${i + 1}/${retries})`);
        
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 2000 * i));
        }
        
        const urlObj = new URL(url);
        const filename = `page_${Date.now()}_${i}.html`;
        const filepath = path.join(this.tempDir, filename);
        
        const wgetCmd = [
          'wget',
          '--timeout=30',
          '--tries=1',
          '--user-agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"',
          '--header="Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"',
          '--header="Accept-Language: en-US,en;q=0.9"',
          '--header="Cache-Control: no-cache"',
          '--no-check-certificate',
          '--quiet',
          `--output-document="${filepath}"`,
          `"${url}"`
        ].join(' ');
        
        console.log(`Running: ${wgetCmd}`);
        
        const { stdout, stderr } = await execAsync(wgetCmd);
        
        if (stderr && !stderr.includes('WARNING')) {
          throw new Error(`wget stderr: ${stderr}`);
        }
        
        if (!await fs.pathExists(filepath)) {
          throw new Error('wget did not create output file');
        }
        
        const content = await fs.readFile(filepath, 'utf8');
        
        if (!content || content.length < 100) {
          throw new Error(`Downloaded content too short: ${content.length} chars`);
        }
        
        console.log(`Downloaded ${content.length} characters`);
        
        const $ = cheerio.load(content);
        
        const title = $('title').text() || $('h1').first().text() || 'Untitled';
        
        console.log(`Extracted title: ${title}`);
        
        this.cleanHtml($);
        
        const images = await this.extractImages($, url);
        
        console.log(`Found ${images.length} images`);
        
        const processedHtml = $.html();
        
        console.log(`Processed HTML length: ${processedHtml.length}`);
        
        // Clean up temp file
        await fs.remove(filepath);

        return {
          title: title.trim(),
          url,
          html: processedHtml,
          images
        };
      } catch (error) {
        lastError = error;
        console.error(`Attempt ${i + 1} failed for ${url}:`, error.message);
        
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
    // 初始化注解数组
    this.pageAnnotations = [];
    
    // 移除不需要的元素
    $('script').remove();
    $('style').remove();
    $('nav').remove();
    $('header').remove();
    $('.advertisement').remove();
    $('.ads').remove();
    $('.sidebar').remove();
    $('.menu').remove();
    $('[class*="ad-"]').remove();
    $('[id*="ad-"]').remove();
    
    // 保留并增强注解、脚注、引用等重要内容
    this.processAnnotations($);
    this.processFootnotes($);
    this.processBlockquotes($);
    
    // 在页面末尾添加注解部分
    this.appendAnnotationsToEnd($);
    
    // 保留图片信息，稍后处理下载
    // 图片会在后续流程中被处理
    
    // 清理样式但保留语义标签
    $('*').each((i, elem) => {
      const $elem = $(elem);
      if ($elem.attr('style')) {
        $elem.removeAttr('style');
      }
      
      // 移除广告相关的元素
      const className = $elem.attr('class') || '';
      if (className.includes('ad') && !this.isImportantElement($elem[0].tagName, className)) {
        $elem.remove();
      }
    });
    
    // 不要移除footer，它可能包含重要的注释或版权信息
    // 只移除明显的导航footer
    $('footer nav').parent().remove();
    $('footer[role="contentinfo"] nav').parent().remove();
  }

  // 在页面末尾添加注解部分
  appendAnnotationsToEnd($) {
    if (!this.pageAnnotations || this.pageAnnotations.length === 0) {
      return;
    }
    
    console.log(`Adding ${this.pageAnnotations.length} annotations to end of page`);
    
    let annotationsHtml = `
      <hr style="margin: 40px 0 30px 0; border: 2px solid #007bff; border-style: solid;">
    `;
    
    this.pageAnnotations.forEach(annotation => {
      let bgColor = '#f8f9fa';
      let borderColor = '#dee2e6';
      
      if (annotation.type === '警告') {
        bgColor = '#fff3cd';
        borderColor = '#ffc107';
      } else if (annotation.type === '信息') {
        bgColor = '#d1ecf1';
        borderColor = '#17a2b8';
      } else if (annotation.type === '提示') {
        bgColor = '#d4edda';
        borderColor = '#28a745';
      } else if (annotation.type === '脚注' || annotation.type === '参考' || annotation.type === '引证' || annotation.type === '参考文献') {
        bgColor = '#fff3cd';
        borderColor = '#ffc107';
      }
      
      annotationsHtml += `
        <div id="${annotation.id}" style="margin: 20px 0; padding: 15px; background: ${bgColor}; border: 2px solid ${borderColor}; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="margin-bottom: 8px; font-size: 16px;">
            <a href="#${annotation.refId}" style="color: #007bff; text-decoration: none; font-weight: bold; font-size: 18px;">[${annotation.number}]</a>
          </div>
          <div style="line-height: 1.6; color: #333;">${annotation.content}</div>
        </div>
      `;
    });
    
    // 查找合适的插入位置
    if ($('body').length > 0) {
      $('body').append(annotationsHtml);
    } else if ($('html').length > 0) {
      $('html').append(annotationsHtml);
    } else {
      // 如果没有body或html标签，插入到最后
      $.root().append(annotationsHtml);
    }
  }

  // 处理注解和批注
  processAnnotations($) {
    const annotations = [];
    let annotationCounter = 1;
    
    // 查找常见的注解选择器
    const annotationSelectors = [
      '.annotation', '.note', '.sidenote', '.margin-note',
      '.comment', '.remark', '.aside', '[data-annotation]',
      '.tooltip', '.hint', '.explanation', '.callout',
      '.warning', '.info', '.tip', '.caution', '.notice',
      '.admonition', '.alert', '.box', '.highlight-box'
    ];
    
    annotationSelectors.forEach(selector => {
      $(selector).each((i, elem) => {
        const $elem = $(elem);
        const content = $elem.text().trim();
        if (content && content.length > 3) {
          // 获取注解类型
          const className = $elem.attr('class') || '';
          let annotationType = '注解';
          let emoji = '📝';
          
          if (className.includes('warning') || className.includes('caution')) {
            annotationType = '警告';
            emoji = '⚠️';
          } else if (className.includes('info') || className.includes('notice')) {
            annotationType = '信息';
            emoji = 'ℹ️';
          } else if (className.includes('tip') || className.includes('hint')) {
            annotationType = '提示';
            emoji = '💡';
          } else if (className.includes('callout')) {
            annotationType = '要点';
            emoji = '🔍';
          }
          
          const annotationId = `annotation-${annotationCounter}`;
          const refId = `ref-${annotationId}`;
          
          // 替换为快捷方式链接 - 只显示数字
          $elem.replaceWith(`<a href="#${annotationId}" id="${refId}" style="color: #007bff; text-decoration: none; font-weight: bold; background: #e3f2fd; padding: 2px 4px; border-radius: 3px; margin: 0 2px;">[${annotationCounter}]</a>`);
          
          // 收集注解内容
          annotations.push({
            id: annotationId,
            refId: refId,
            number: annotationCounter,
            type: annotationType,
            emoji: emoji,
            content: content
          });
          
          annotationCounter++;
          console.log(`Found ${annotationType}: ${content.substring(0, 50)}...`);
        }
      });
    });

    // 处理代码注释（在pre/code块中的注释）
    $('pre, code').each((i, elem) => {
      const $elem = $(elem);
      const content = $elem.html();
      
      // 查找常见的代码注释格式并高亮显示
      let modifiedContent = content;
      const commentPatterns = [
        { pattern: /(\/\/\s*(.+))$/gm, replacement: '<span style="color: #008000; font-style: italic;">$1</span>' },
        { pattern: /(#\s*(.+))$/gm, replacement: '<span style="color: #008000; font-style: italic;">$1</span>' },
        { pattern: /(\/\*\s*([\s\S]+?)\s*\*\/)/g, replacement: '<span style="color: #008000; font-style: italic;">$1</span>' }
      ];
      
      commentPatterns.forEach(({ pattern, replacement }) => {
        if (pattern.test(content)) {
          modifiedContent = modifiedContent.replace(pattern, replacement);
          console.log(`Highlighted code comments in code block`);
        }
      });
      
      if (modifiedContent !== content) {
        $elem.html(modifiedContent);
      }
    });
    
    // 存储注解以便后续使用
    this.pageAnnotations = annotations;
  }

  // 处理脚注
  processFootnotes($) {
    if (!this.pageAnnotations) this.pageAnnotations = [];
    let annotationCounter = this.pageAnnotations.length + 1;
    
    const footnoteSelectors = [
      '.footnote', '.footnotes', '.endnote', '.endnotes',
      '[role="doc-footnote"]', '[role="doc-endnote"]',
      '.fn', '.foot-note', '.reference',
      '.cite', '.citation', '.ref', '.bibliography'
    ];
    
    // 处理脚注容器，提取其中的内容
    footnoteSelectors.forEach(selector => {
      $(selector).each((i, elem) => {
        const $elem = $(elem);
        const content = $elem.text().trim();
        if (content && content.length > 1) {
          // 获取脚注类型
          const className = $elem.attr('class') || '';
          let footnoteType = '脚注';
          let emoji = '📚';
          
          if (className.includes('reference') || className.includes('ref')) {
            footnoteType = '参考';
            emoji = '🔗';
          } else if (className.includes('citation') || className.includes('cite')) {
            footnoteType = '引证';
            emoji = '📖';
          } else if (className.includes('bibliography')) {
            footnoteType = '参考文献';
            emoji = '📋';
          }
          
          const annotationId = `footnote-${annotationCounter}`;
          const refId = `ref-${annotationId}`;
          
          // 如果是脚注容器，只添加标题不替换
          if (selector === '.footnotes' || selector === '.references' || selector === '.notes' || selector === '.endnotes') {
            // 脚注容器保持原位，只添加样式
            $elem.prepend(`<h3>${emoji} 注释与参考</h3>`);
            $elem.addClass('epub-footnotes-section');
            return;
          }
          
          // 替换为快捷方式链接 - 只显示数字
          $elem.replaceWith(`<a href="#${annotationId}" id="${refId}" style="color: #007bff; text-decoration: none; font-weight: bold; background: #fff3cd; padding: 2px 4px; border-radius: 3px; margin: 0 2px;">[${annotationCounter}]</a>`);
          
          // 收集脚注内容
          this.pageAnnotations.push({
            id: annotationId,
            refId: refId,
            number: annotationCounter,
            type: footnoteType,
            emoji: emoji,
            content: content
          });
          
          annotationCounter++;
          console.log(`Found ${footnoteType}: ${content.substring(0, 50)}...`);
        }
      });
    });

    // 处理上标形式的脚注引用，创建双向链接
    $('sup').each((i, elem) => {
      const $elem = $(elem);
      const $link = $elem.find('a');
      
      if ($link.length && $link.attr('href') && $link.attr('href').startsWith('#')) {
        // 保持原有样式，但增强视觉效果
        $elem.css({
          'background': '#e3f2fd',
          'padding': '2px 4px',
          'border-radius': '3px',
          'margin': '0 2px'
        });
        $link.css({
          'color': '#1976d2',
          'text-decoration': 'none',
          'font-weight': 'bold'
        });
        $link.attr('title', '查看脚注');
      }
    });
  }

  // 处理引用和块引用
  processBlockquotes($) {
    $('blockquote').each((i, elem) => {
      const $elem = $(elem);
      const cite = $elem.attr('cite') || $elem.find('cite').text();
      
      // 添加引用标识
      $elem.prepend('<strong>[引用]</strong><br>');
      
      if (cite) {
        $elem.append(`<br><em>—— 来源: ${cite}</em>`);
      }
      
      $elem.addClass('epub-blockquote');
      console.log(`Found blockquote: ${$elem.text().substring(0, 50)}...`);
    });

    // 处理内联引用
    $('q, cite').each((i, elem) => {
      const $elem = $(elem);
      $elem.addClass('epub-citation');
    });
  }

  // 检查是否是重要元素（避免误删）
  isImportantElement(tagName, className) {
    const importantTags = ['main', 'article', 'section', 'aside', 'blockquote'];
    const importantClasses = ['content', 'note', 'annotation', 'footnote', 'reference'];
    
    if (importantTags.includes(tagName.toLowerCase())) {
      return true;
    }
    
    return importantClasses.some(cls => className.includes(cls));
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
    try {
      if (await fs.pathExists(this.tempDir)) {
        await fs.remove(this.tempDir);
      }
    } catch (error) {
      console.warn('Failed to cleanup wget temp directory:', error.message);
    }
  }
}

export default WgetScraper;