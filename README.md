# EPUB Maker

一个基于 Node.js 的工具，可以从网页URL列表创建EPUB电子书。该工具会自动抓取网页内容，保留文章结构和图片，生成标准的EPUB格式电子书。

## 功能特性

- 🌐 支持多个URL批量处理
- 📄 保留原始网页结构和格式
- 📝 **智能注解处理** - 自动识别和保留页面注解、脚注、引用等重要内容
- 🔗 **可点击链接支持** - 注解和脚注支持双向跳转，提升阅读体验  
- 🖼️ **图片自动下载** - 自动下载并嵌入网页图片，失败时使用占位符
- 📚 生成标准EPUB 3.0格式
- 🧹 自动清理广告和无关内容
- ⚡ 基于wget的稳定网页下载
- 🔄 支持逗号分割和空格分割URL输入

## 安装

```bash
# 克隆项目
git clone <repository-url>
cd epub-maker

# 安装依赖
npm install

# 确保系统安装了wget (macOS用户)
brew install wget

# 或者 (Linux用户)
# sudo apt-get install wget   # Ubuntu/Debian
# sudo yum install wget       # CentOS/RHEL
```

## 使用方法

### 命令行使用

```bash
# 基本用法 - 空格分割
npm start <url1> <url2> <url3>

# 逗号分割用法
npm start "url1,url2,url3"

# 示例
npm start https://example.com https://another-site.com
npm start "https://example.com,https://another-site.com,https://third-site.com"

# 处理带注解的学术页面
npm start "https://browser.engineering/http.html"
```

### 注解处理功能

工具会自动识别和处理以下类型的注解内容：

- **📝 页面注解**: `.note`, `.annotation`, `.sidenote`, `.margin-note`等
  - 添加彩色边框和图标标识
  - 支持警告⚠️、信息ℹ️、提示💡等不同类型
- **📚 脚注引用**: `.footnote`, `.reference`, `.citation`等  
  - 创建双向可点击链接
  - 支持从正文跳转到脚注，从脚注返回正文
- **💬 引用内容**: `<blockquote>`, `<cite>`, `<q>`等
  - 自动添加引用标识和来源信息
- **🔗 链接脚注**: 自动解析上标链接
  - 保持原有的点击跳转功能
  - 添加返回链接便于导航
- **💻 代码注释**: 识别并高亮显示代码块中的注释
  - 支持 `//`, `#`, `/* */` 等注释格式
  - 用绿色斜体样式突出显示

所有注解都会添加明显的标识和样式，并在EPUB阅读器中支持点击交互。

### 编程方式使用

```javascript
import EpubMaker from './src/EpubMaker.js';

const urlList = [
  'https://example.com/article1',
  'https://example.com/article2'
];

const epubMaker = new EpubMaker({
  title: 'My Article Collection',
  author: 'Author Name',
  language: 'zh'
});

const epubPath = await epubMaker.createEpubFromUrls(urlList);
console.log('EPUB created:', epubPath);
```

## 配置选项

```javascript
const options = {
  title: 'Web Articles Collection',  // EPUB标题
  author: 'Web Scraper',            // 作者名称
  language: 'en',                   // 语言代码
  outputDir: './output'             // 输出目录
};
```

## 项目结构

```
epub-maker/
├── src/
│   ├── index.js          # 主入口文件
│   ├── EpubMaker.js      # EPUB生成器主类
│   ├── WgetScraper.js    # 基于wget的网页抓取
│   └── ImageDownloader.js # 图片下载处理
├── test/
│   └── example.js        # 使用示例
├── output/               # EPUB输出目录
└── temp/                 # 临时文件目录
```

## 依赖说明

- **wget**: 系统命令，用于稳定的网页内容下载
- **epub-gen**: EPUB文件生成
- **cheerio**: HTML解析和处理
- **axios**: 图片下载处理
- **fs-extra**: 文件系统操作增强

## 运行测试

```bash
npm test
```

## 注意事项

1. 需要系统安装wget命令
2. 确保网络连接稳定，用于抓取网页内容和下载图片
3. 生成的EPUB文件保存在 `output/` 目录中
4. 临时文件会在处理完成后自动清理

## 故障排除

如果遇到网页抓取失败的问题：
1. 检查URL是否可访问
2. 确保wget已正确安装：`which wget`
3. 某些网站可能有反爬虫机制，项目会自动重试
4. 检查网络连接和防火墙设置

## 许可证

MIT License