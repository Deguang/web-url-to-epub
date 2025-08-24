import EpubMaker from '../src/EpubMaker.js';

// 模拟测试数据
const mockContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Test Article</title>
</head>
<body>
    <h1>Test Article Title</h1>
    <p>This is a test paragraph with some content.</p>
    <p>Another paragraph with more text to demonstrate the EPUB generation.</p>
    <img src="https://via.placeholder.com/300x200" alt="Test Image">
    <h2>Subheading</h2>
    <p>More content under the subheading.</p>
    <ul>
        <li>List item 1</li>
        <li>List item 2</li>
        <li>List item 3</li>
    </ul>
</body>
</html>
`;

// 重写SimpleScraper用于离线测试
class MockScraper {
  async scrapeUrl(url) {
    console.log(`Mock scraping: ${url}`);
    return {
      title: 'Test Article - Mock Data',
      url,
      html: mockContent,
      images: [{
        originalSrc: 'https://via.placeholder.com/300x200',
        fullUrl: 'https://via.placeholder.com/300x200',
        alt: 'Test Image'
      }]
    };
  }

  async close() {
    // No cleanup needed
  }
}

async function testOffline() {
  const epubMaker = new EpubMaker({
    title: 'Offline Test Collection',
    author: 'Test Author',
    language: 'en'
  });

  // 替换爬虫为mock版本
  epubMaker.webScraper = new MockScraper();

  try {
    console.log('Starting offline test...');
    const epubPath = await epubMaker.createEpubFromUrls([
      'https://test-url-1.com',
      'https://test-url-2.com'
    ]);
    console.log('Offline test completed successfully!');
    console.log('EPUB created at:', epubPath);
  } catch (error) {
    console.error('Offline test failed:', error.message);
    process.exit(1);
  }
}

testOffline();