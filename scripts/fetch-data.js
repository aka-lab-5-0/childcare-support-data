const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');

const DATA_URL = 'https://data.storage.data.metro.tokyo.lg.jp/govtech/130001_kosodateshienseido_tokyo.json';
const OUTPUT_PATH = path.join(__dirname, '../data/raw/130001_kosodateshienseido_tokyo.json');

async function fetchData() {
  console.log('Fetching data from:', DATA_URL);
  
  try {
    const response = await axios.get(DATA_URL, {
      timeout: 30000,
      headers: {
        'User-Agent': 'childcare-support-data/1.0.0'
      }
    });
    
    console.log('Data fetched successfully');
    console.log('Response size:', JSON.stringify(response.data).length, 'bytes');
    console.log('Number of items:', response.data.length);
    
    // Ensure output directory exists
    await fs.ensureDir(path.dirname(OUTPUT_PATH));
    
    // Save raw data
    await fs.writeJson(OUTPUT_PATH, response.data, { spaces: 2 });
    
    console.log('Data saved to:', OUTPUT_PATH);
    
    // Log first item for verification
    if (response.data.length > 0) {
      console.log('First item structure:');
      console.log(JSON.stringify(response.data[0], null, 2));
    }
    
  } catch (error) {
    console.error('Error fetching data:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  fetchData();
}

module.exports = { fetchData };