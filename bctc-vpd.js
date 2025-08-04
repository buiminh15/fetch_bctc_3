const axios = require('axios');
const { sendTelegramNotification } = require('./bot');
const { COMPANIES } = require('./constants/companies');
const { insertBCTC, filterNewNames } = require('./bctc');
console.log('📢 [bctc-geg.js:5]', 'running');

const axiosRetry = require('axios-retry');

axiosRetry.default(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    // Retry nếu là network error, request idempotent, hoặc timeout
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.code === 'ECONNABORTED';
  }
});

const PAYLOAD = {
  "categoryInfoId": 804,
  "listCategoryInfoId": [],
  "categorySlug": "bao-cao-qui",
  "filter": "",
  "sorting": "",
  "skipCount": 0,
  "maxResultCount": 10
};

async function fetchAndExtractData() {
  try {
    const response = await axios.post(
      'https://api.vnpd.vn/api/services/app/Slug/SearchNews',
      PAYLOAD,
      {
        headers: {
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.7',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-site',
          'Sec-GPC': '1',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
          'X-Requested-Store': 'default',
          'X-Requested-With': 'XMLHttpRequest',
          'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Brave";v="138"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"'
        },
        timeout: 60000
      }
    );
    const currentYear = new Date().getFullYear().toString();
    const items = response.data || [];
    const names = items.result.items.filter(item => item.newsInfo.title.includes(currentYear)).map(item => item.newsInfo.title);

    if (names.length === 0) {
      console.log('Không tìm thấy báo cáo tài chính nào.');
      return;
    }
    // Lọc ra các báo cáo chưa có trong DB
    const newNames = await filterNewNames(names, COMPANIES.VPD);
    console.log('📢 [bctc-geg.js:44]', newNames);
    if (newNames.length) {
      await insertBCTC(newNames, COMPANIES.VPD);

      // Gửi thông báo Telegram cho từng báo cáo mới;
      await Promise.all(
        newNames.map(name =>
          sendTelegramNotification(`Báo cáo tài chính của VPD::: ${name}`)
        )
      );
      console.log(`Đã thêm ${newNames.length} báo cáo mới và gửi thông báo.`);
    } else {
      console.log('Không có báo cáo mới.');
    }
  } catch (error) {
    console.error('Error fetching API:', error.message);
    process.exit(1);
  }
}

fetchAndExtractData();