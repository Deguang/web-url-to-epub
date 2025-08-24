import EpubMaker from '../src/EpubMaker.js';

async function testEpubMaker() {
  console.log('Testing comma-separated URL parsing...');
  
  const commaUrlsString = 'https://example.com,https://httpbin.org/html';
  const urlList = commaUrlsString.split(',').map(url => url.trim()).filter(url => url);
  
  console.log('Parsed URLs:', urlList);

  const epubMaker = new EpubMaker({
    title: 'Test Articles Collection',
    author: 'Test Author',
    language: 'en'
  });

  try {
    console.log('Starting test...');
    const epubPath = await epubMaker.createEpubFromUrls(urlList);
    console.log('Test completed successfully!');
    console.log('EPUB created at:', epubPath);
  } catch (error) {
    console.error('Test failed:', error.message);
    process.exit(1);
  }
}

testEpubMaker();