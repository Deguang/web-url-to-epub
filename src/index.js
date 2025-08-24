import EpubMaker from './EpubMaker.js';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage:');
    console.log('  npm start <url1> <url2> ...');
    console.log('  npm start "url1,url2,url3"');
    console.log('Examples:');
    console.log('  npm start https://example.com https://another.com');
    console.log('  npm start "https://example.com,https://another.com"');
    process.exit(1);
  }

  let urlList = [];
  
  if (args.length === 1 && args[0].includes(',')) {
    urlList = args[0].split(',').map(url => url.trim()).filter(url => url);
  } else {
    urlList = args;
  }
  
  if (urlList.length === 0) {
    console.log('Error: No valid URLs provided');
    process.exit(1);
  }

  const epubMaker = new EpubMaker();
  
  try {
    console.log('Starting EPUB creation...');
    const epubPath = await epubMaker.createEpubFromUrls(urlList);
    console.log(`EPUB created successfully: ${epubPath}`);
  } catch (error) {
    console.error('Error creating EPUB:', error.message);
    process.exit(1);
  }
}

main();