const fs = require('fs-extra');
const path = require('path');

const RAW_DATA_PATH = path.join(__dirname, '../data/raw/130001_kosodateshienseido_tokyo.json');
const PROCESSED_DIR = path.join(__dirname, '../data/processed');

// カテゴリ分類のルール
const CATEGORY_RULES = {
  vaccination: ['予防接種', 'ワクチン', 'BCG', 'DPT', 'IPV', 'MR', 'DT', 'HPV'],
  childcare: ['保育', '一時預かり', '預かり', '託児', '保育園', '幼稚園'],
  financial: ['手当', '助成', '給付', '支援金', '補助金', '現金', '金銭'],
  medical: ['健診', '医療', '検診', '診察', '治療', '相談'],
  education: ['教育', '学習', '講座', '教室', '指導', '研修'],
  other: []
};

function categorizeItem(item) {
  const canonicalName = item.institutionName?.canonicalName || '';
  const shortName = item.institutionName?.shortName || '';
  const summary = item.summary || '';
  const description = item.description || '';
  
  const text = `${canonicalName} ${shortName} ${summary} ${description}`;
  
  for (const [category, keywords] of Object.entries(CATEGORY_RULES)) {
    if (category === 'other') continue;
    
    if (keywords.some(keyword => text.includes(keyword))) {
      return category;
    }
  }
  
  return 'other';
}

function extractAreaCode(areaCodeField) {
  if (!areaCodeField) return null;
  
  const parts = areaCodeField.split(';');
  return parts[0] || null;
}

function extractAreaName(areaCodeField) {
  if (!areaCodeField) return null;
  
  const parts = areaCodeField.split(';');
  return parts[1] || null;
}

async function processData() {
  console.log('Processing data...');
  
  try {
    // 元データを読み込み
    const rawData = await fs.readJson(RAW_DATA_PATH);
    console.log('Raw data loaded:', rawData.length, 'items');
    
    // 処理済みディレクトリを初期化
    await fs.emptyDir(PROCESSED_DIR);
    await fs.ensureDir(path.join(PROCESSED_DIR, 'by-area'));
    await fs.ensureDir(path.join(PROCESSED_DIR, 'by-category'));
    await fs.ensureDir(path.join(PROCESSED_DIR, 'metadata'));
    
    // カテゴリ別ディレクトリを作成
    for (const category of Object.keys(CATEGORY_RULES)) {
      await fs.ensureDir(path.join(PROCESSED_DIR, 'by-category', category));
    }
    
    // データを地域別・カテゴリ別に分類
    const areaData = {};
    const categoryData = {};
    const areaStats = {};
    const categoryStats = {};
    
    for (const item of rawData) {
      const areaCode = extractAreaCode(item.area?.areaCode);
      const areaName = extractAreaName(item.area?.areaCode);
      const category = categorizeItem(item);
      
      if (!areaCode) continue;
      
      // 地域別データを集計
      if (!areaData[areaCode]) {
        areaData[areaCode] = {
          version: new Date().toISOString(),
          areaCode,
          areaName,
          count: 0,
          items: []
        };
      }
      areaData[areaCode].items.push(item);
      areaData[areaCode].count++;
      
      // カテゴリ別データを集計
      if (!categoryData[category]) {
        categoryData[category] = {};
      }
      if (!categoryData[category][areaCode]) {
        categoryData[category][areaCode] = {
          version: new Date().toISOString(),
          areaCode,
          areaName,
          category,
          count: 0,
          items: []
        };
      }
      categoryData[category][areaCode].items.push(item);
      categoryData[category][areaCode].count++;
      
      // 統計データを更新
      if (!areaStats[areaCode]) {
        areaStats[areaCode] = {
          code: areaCode,
          name: areaName,
          itemCount: 0,
          lastUpdated: new Date().toISOString()
        };
      }
      areaStats[areaCode].itemCount++;
      
      if (!categoryStats[category]) {
        categoryStats[category] = {
          id: category,
          name: getCategoryName(category),
          description: getCategoryDescription(category),
          itemCount: 0
        };
      }
      categoryStats[category].itemCount++;
    }
    
    // 地域別ファイルを保存
    console.log('Saving area-based files...');
    for (const [areaCode, data] of Object.entries(areaData)) {
      const filePath = path.join(PROCESSED_DIR, 'by-area', `${areaCode}.json`);
      await fs.writeJson(filePath, data, { spaces: 2 });
    }
    
    // カテゴリ別ファイルを保存
    console.log('Saving category-based files...');
    for (const [category, areas] of Object.entries(categoryData)) {
      for (const [areaCode, data] of Object.entries(areas)) {
        const filePath = path.join(PROCESSED_DIR, 'by-category', category, `${areaCode}.json`);
        await fs.writeJson(filePath, data, { spaces: 2 });
      }
    }
    
    // メタデータファイルを保存
    console.log('Saving metadata files...');
    
    // areas.json
    const areasMetadata = Object.values(areaStats).sort((a, b) => a.code.localeCompare(b.code));
    await fs.writeJson(path.join(PROCESSED_DIR, 'metadata', 'areas.json'), areasMetadata, { spaces: 2 });
    
    // categories.json
    const categoriesMetadata = Object.values(categoryStats).sort((a, b) => a.id.localeCompare(b.id));
    await fs.writeJson(path.join(PROCESSED_DIR, 'metadata', 'categories.json'), categoriesMetadata, { spaces: 2 });
    
    // versions.json
    const versionsMetadata = {
      lastUpdated: new Date().toISOString(),
      version: '1.0.0',
      sourceUrl: 'https://data.storage.data.metro.tokyo.lg.jp/govtech/130001_kosodateshienseido_tokyo.json',
      totalItems: rawData.length,
      areas: Object.keys(areaStats).length,
      categories: Object.keys(categoryStats).length
    };
    await fs.writeJson(path.join(PROCESSED_DIR, 'metadata', 'versions.json'), versionsMetadata, { spaces: 2 });
    
    console.log('Data processing completed successfully!');
    console.log(`- Total items: ${rawData.length}`);
    console.log(`- Areas: ${Object.keys(areaStats).length}`);
    console.log(`- Categories: ${Object.keys(categoryStats).length}`);
    console.log(`- Area files: ${Object.keys(areaData).length}`);
    console.log(`- Category files: ${Object.values(categoryData).reduce((sum, areas) => sum + Object.keys(areas).length, 0)}`);
    
  } catch (error) {
    console.error('Error processing data:', error.message);
    process.exit(1);
  }
}

function getCategoryName(category) {
  const names = {
    vaccination: '予防接種',
    childcare: '保育・一時預かり',
    financial: '金銭支援',
    medical: '医療・健診',
    education: '教育・学習',
    other: 'その他'
  };
  return names[category] || 'その他';
}

function getCategoryDescription(category) {
  const descriptions = {
    vaccination: '定期予防接種・任意予防接種に関する情報',
    childcare: '保育園・幼稚園・一時預かりに関する情報',
    financial: '手当・助成・給付に関する情報',
    medical: '健診・医療に関する情報',
    education: '教育・学習支援に関する情報',
    other: 'その他の子育て支援制度'
  };
  return descriptions[category] || 'その他の子育て支援制度';
}

if (require.main === module) {
  processData();
}

module.exports = { processData };