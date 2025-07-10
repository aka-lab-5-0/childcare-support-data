const fs = require('fs-extra');
const path = require('path');

const AREAS_FILE = path.join(__dirname, '../data/processed/metadata/areas.json');
const MERGED_AREAS_FILE = path.join(__dirname, '../data/processed/metadata/merged-areas.json');

// 東京都の都道府県コード
const TOKYO_PREFECTURE_CODE = '130001';

// 東京都の市区町村かどうかを判定
function isTokyoMunicipality(code) {
  // 東京都の市区町村は131xxx, 132xxx, 133xxx, 134xxxの形式
  return code.startsWith('131') || code.startsWith('132') || 
         code.startsWith('133') || code.startsWith('134');
}

async function mergeTokyoAreas() {
  console.log('Merging Tokyo areas...');
  
  try {
    // areas.jsonを読み込み
    const areas = await fs.readJson(AREAS_FILE);
    console.log(`Loaded ${areas.length} areas`);
    
    // 東京都のデータを取得
    const tokyoPrefecture = areas.find(area => area.code === TOKYO_PREFECTURE_CODE);
    if (!tokyoPrefecture) {
      throw new Error('Tokyo prefecture data not found');
    }
    
    // 結合されたエリアデータを格納する配列
    const mergedAreas = [];
    
    // 東京都以外の道府県データを追加
    for (const area of areas) {
      if (area.code === TOKYO_PREFECTURE_CODE) {
        // 東京都単体のデータはスキップ（市区町村と結合するため）
        continue;
      }
      
      if (isTokyoMunicipality(area.code)) {
        // 東京都の市区町村の場合は、東京都と結合
        const mergedArea = {
          code: `${TOKYO_PREFECTURE_CODE}_${area.code}`,
          name: `東京都${area.name}`,
          itemCount: tokyoPrefecture.itemCount + area.itemCount, // 東京都と市区町村のアイテム数を合計
          lastUpdated: area.lastUpdated,
          prefecture: {
            code: TOKYO_PREFECTURE_CODE,
            name: tokyoPrefecture.name,
            itemCount: tokyoPrefecture.itemCount
          },
          municipality: {
            code: area.code,
            name: area.name,
            itemCount: area.itemCount
          }
        };
        mergedAreas.push(mergedArea);
      } else {
        // 東京都以外のエリアはそのまま追加
        mergedAreas.push(area);
      }
    }
    
    // コード順でソート
    mergedAreas.sort((a, b) => a.code.localeCompare(b.code));
    
    // 結果を保存
    await fs.writeJson(MERGED_AREAS_FILE, mergedAreas, { spaces: 2 });
    
    console.log('Merge completed successfully!');
    console.log(`- Original areas: ${areas.length}`);
    console.log(`- Merged areas: ${mergedAreas.length}`);
    console.log(`- Tokyo municipalities merged: ${mergedAreas.filter(a => a.code.includes('_')).length}`);
    
    // サンプル出力
    console.log('\nSample merged areas:');
    const samples = mergedAreas.filter(a => a.code.includes('_')).slice(0, 3);
    samples.forEach(area => {
      console.log(`  - ${area.name} (${area.code})`);
    });
    
  } catch (error) {
    console.error('Error merging areas:', error.message);
    process.exit(1);
  }
}

// 統合された地域データを取得する関数
async function getMergedAreas() {
  try {
    return await fs.readJson(MERGED_AREAS_FILE);
  } catch (error) {
    console.error('Merged areas file not found. Run merge-tokyo-areas.js first.');
    return null;
  }
}

// 地域コードから統合されたデータを検索する関数
function findMergedArea(mergedAreas, prefectureCode, municipalityCode) {
  if (!municipalityCode) {
    // 市区町村コードがない場合は、都道府県コードで検索
    return mergedAreas.find(area => area.code === prefectureCode);
  }
  
  // 東京都の場合は結合されたコードで検索
  if (prefectureCode === TOKYO_PREFECTURE_CODE) {
    const mergedCode = `${prefectureCode}_${municipalityCode}`;
    return mergedAreas.find(area => area.code === mergedCode);
  }
  
  // 東京都以外は市区町村コードで検索
  return mergedAreas.find(area => area.code === municipalityCode);
}

if (require.main === module) {
  mergeTokyoAreas();
}

module.exports = { 
  mergeTokyoAreas, 
  getMergedAreas, 
  findMergedArea,
  isTokyoMunicipality,
  TOKYO_PREFECTURE_CODE
};