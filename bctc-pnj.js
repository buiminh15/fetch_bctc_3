const axios = require('axios');
const cheerio = require('cheerio');
const { sendTelegramNotification } = require('./bot');
const { COMPANIES } = require('./constants/companies');
const { insertBCTC, filterNewNames } = require('./bctc');
const he = require('he');
console.log('📢 [bctc-cdn.js:7]', 'running');

const https = require('https');
const agent = new https.Agent({
  rejectUnauthorized: false
});

const axiosRetry = require('axios-retry');

axiosRetry.default(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    // Retry nếu là network error, request idempotent, hoặc timeout
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.code === 'ECONNABORTED';
  }
});

async function fetchAndExtractData() {
  try {
    const response = await axios.get('https://www.pnj.com.vn/quan-he-co-dong/bao-cao-tai-chinh/', {
      headers: {
        'accept': 'text/html',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      },
      timeout: 60000,
      httpsAgent: agent
    });

    const html = response.data;
    const $ = cheerio.load(html);
    const currentYear = new Date().getFullYear().toString();
    // Lấy tối đa 5 báo cáo mới nhất
    const names = [];
    $('.answer').each((i, div) => {
      // Lấy toàn bộ text trước mỗi <a>
      $(div).find('a').each((j, a) => {
        // Lấy node text trước <a>
        let prevNode = a.prev;
        if (prevNode && prevNode.type === 'text') {
          let text = prevNode.data.trim();
          if (text.startsWith('-')) text = text.replace(/^-\s*/, ''); // bỏ dấu "- " đầu dòng nếu có
          if (text.length > 0 && text.includes(currentYear)) {
            names.push(text);
          }
        }
      });
    });

    if (names.length === 0) {
      console.log('Không tìm thấy báo cáo tài chính nào.');
      return;
    }
    console.log('📢 [bctc-mbs.js:50]', names);
    // Lọc ra các báo cáo chưa có trong DB
    const newNames = await filterNewNames(names, COMPANIES.PNJ);
    console.log('📢 [bctc-cdn.js:46]', newNames);
    if (newNames.length) {
      await insertBCTC(newNames, COMPANIES.PNJ);

      // Gửi thông báo Telegram cho từng báo cáo mới
      await Promise.all(
        newNames.map(name => {
          return sendTelegramNotification(`Báo cáo tài chính của PNJ ::: ${name}`);
        })
      );
      console.log(`Đã thêm ${newNames.length} báo cáo mới và gửi thông báo.`);
    } else {
      console.log('Không có báo cáo mới.');
    }
  } catch (error) {
    console.error('Error fetching HTML:', error);
    process.exit(1);
  }
}

fetchAndExtractData();