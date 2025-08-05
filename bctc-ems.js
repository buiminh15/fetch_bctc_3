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

async function fetchAndExtractData() {
  const currentYear = new Date().getFullYear().toString();
  try {
    const response = await axios.get(
      `https://admin.ems.com.vn/api/categoryShareHolder/get-category-share-holder-by-lang?langId=1&year=${currentYear}`,
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

    // response.data là object JSON, thường có dạng { data: [ ... ], ... }
    const items = response.data || {};
    const res = Array.isArray(items.response) ? items.response : [];

    // Tìm mục "Báo cáo tài chính"
    const bctcCategory = res.find(item =>
      item.name.toLowerCase().includes('báo cáo tài chính')
    );

    // Lấy ra danh sách `postDetail.name` có chứa năm hiện tại
    const names = (bctcCategory?.posts || [])
      .filter(post => post.postDetail?.name?.includes(currentYear))
      .map(post => post.postDetail.name);


    if (names.length === 0) {
      console.log('Không tìm thấy báo cáo tài chính nào.');
      return;
    }
    console.log('📢 [bctc-SAF.js:50]', names);
    // Lọc ra các báo cáo chưa có trong DB
    const newNames = await filterNewNames(names, COMPANIES.EMS);
    console.log('📢 [bctc-geg.js:44]', newNames);
    if (newNames.length) {
      await insertBCTC(newNames, COMPANIES.EMS);

      // Gửi thông báo Telegram cho từng báo cáo mới;
      await Promise.all(
        newNames.map(name =>
          sendTelegramNotification(`Báo cáo tài chính của EMS::: ${name}`)
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