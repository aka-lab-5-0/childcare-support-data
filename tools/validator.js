const fs = require('fs-extra');
const path = require('path');

const PROCESSED_DIR = path.join(__dirname, '../data/processed');

class DataValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.stats = {
      totalFiles: 0,
      totalItems: 0,
      validItems: 0,
      errorItems: 0,
      warningItems: 0
    };
  }

  addError(file, itemIndex, field, message) {
    this.errors.push({
      file,
      itemIndex,
      field,
      message
    });
    this.stats.errorItems++;
  }

  addWarning(file, itemIndex, field, message) {
    this.warnings.push({
      file,
      itemIndex,
      field,
      message
    });
    this.stats.warningItems++;
  }

  validateRequiredFields(item, itemIndex, fileName) {
    const requiredFields = [
      'institutionName.canonicalName',
      'area.areaCode',
      'basicInformation.psid'
    ];

    for (const fieldPath of requiredFields) {
      const value = this.getNestedValue(item, fieldPath);
      if (!value) {
        this.addError(fileName, itemIndex, fieldPath, `Missing required field: ${fieldPath}`);
      }
    }
  }

  validateAreaCode(item, itemIndex, fileName) {
    const areaCode = item.area?.areaCode;
    if (!areaCode) return;

    // 地域コードの形式チェック（数字;名前）
    const areaCodePattern = /^[0-9]+;.+$/;
    if (!areaCodePattern.test(areaCode)) {
      this.addError(fileName, itemIndex, 'area.areaCode', `Invalid area code format: ${areaCode}`);
    }

    // 地域コードの長さチェック
    const codeOnly = areaCode.split(';')[0];
    if (codeOnly && (codeOnly.length < 5 || codeOnly.length > 6)) {
      this.addWarning(fileName, itemIndex, 'area.areaCode', `Unusual area code length: ${codeOnly}`);
    }
  }

  validateTargetAge(item, itemIndex, fileName) {
    const target = item.target;
    if (!target) return;

    // 対象年齢の妥当性チェック
    const checkAgeField = (field, fieldName) => {
      if (field && typeof field === 'object') {
        const { targetAge, targetAgeOfMonths } = field;
        
        if (targetAge !== null && (typeof targetAge !== 'number' || targetAge < 0 || targetAge > 100)) {
          this.addWarning(fileName, itemIndex, `target.${fieldName}.targetAge`, `Invalid target age: ${targetAge}`);
        }
        
        if (targetAgeOfMonths !== null && (typeof targetAgeOfMonths !== 'number' || targetAgeOfMonths < 0 || targetAgeOfMonths > 120)) {
          this.addWarning(fileName, itemIndex, `target.${fieldName}.targetAgeOfMonths`, `Invalid target age months: ${targetAgeOfMonths}`);
        }
      }
    };

    checkAgeField(target.lessThan, 'lessThan');
    checkAgeField(target.lessThanOrEqualTo, 'lessThanOrEqualTo');
    checkAgeField(target.greaterThan, 'greaterThan');
    checkAgeField(target.greaterThanOrEqualTo, 'greaterThanOrEqualTo');
  }

  validatePsid(item, itemIndex, fileName) {
    const psid = item.basicInformation?.psid;
    if (!psid) return;

    // PSIDの形式チェック（psid3.0+で始まる）
    if (!psid.startsWith('psid3.0+')) {
      this.addWarning(fileName, itemIndex, 'basicInformation.psid', `Unusual PSID format: ${psid}`);
    }
  }

  validateDuplicates(items, fileName) {
    const psidMap = new Map();
    
    items.forEach((item, index) => {
      const psid = item.basicInformation?.psid;
      if (psid) {
        if (psidMap.has(psid)) {
          this.addError(fileName, index, 'basicInformation.psid', `Duplicate PSID: ${psid} (also found at index ${psidMap.get(psid)})`);
        } else {
          psidMap.set(psid, index);
        }
      }
    });
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : null;
    }, obj);
  }

  async validateFile(filePath) {
    const fileName = path.basename(filePath);
    console.log(`Validating ${fileName}...`);

    try {
      const data = await fs.readJson(filePath);
      const items = data.items || [];
      
      this.stats.totalFiles++;
      this.stats.totalItems += items.length;

      // 各アイテムを検証
      items.forEach((item, index) => {
        const errorCountBefore = this.errors.length;
        
        this.validateRequiredFields(item, index, fileName);
        this.validateAreaCode(item, index, fileName);
        this.validateTargetAge(item, index, fileName);
        this.validatePsid(item, index, fileName);
        
        if (this.errors.length === errorCountBefore) {
          this.stats.validItems++;
        }
      });

      // 重複チェック
      this.validateDuplicates(items, fileName);

      const fileErrors = this.errors.filter(e => e.file === fileName);
      const fileWarnings = this.warnings.filter(w => w.file === fileName);

      if (fileErrors.length === 0) {
        console.log(`✓ ${fileName}: ${items.length} items validated`);
      } else {
        console.log(`✗ ${fileName}: ${fileErrors.length} errors found`);
      }

      if (fileWarnings.length > 0) {
        console.log(`⚠ ${fileName}: ${fileWarnings.length} warnings`);
      }

    } catch (error) {
      this.addError(fileName, null, 'file', `Failed to read file: ${error.message}`);
      console.log(`✗ ${fileName}: Failed to read file`);
    }
  }

  async validateAllFiles() {
    console.log('Starting data validation...\n');

    // 地域別ファイルを検証
    const areaDir = path.join(PROCESSED_DIR, 'by-area');
    const areaFiles = await fs.readdir(areaDir);
    
    for (const file of areaFiles.filter(f => f.endsWith('.json'))) {
      await this.validateFile(path.join(areaDir, file));
    }

    // カテゴリ別ファイルを検証
    const categoryDir = path.join(PROCESSED_DIR, 'by-category');
    const categories = await fs.readdir(categoryDir);
    
    for (const category of categories) {
      const categoryPath = path.join(categoryDir, category);
      const categoryFiles = await fs.readdir(categoryPath);
      
      for (const file of categoryFiles.filter(f => f.endsWith('.json'))) {
        await this.validateFile(path.join(categoryPath, file));
      }
    }

    // メタデータファイルを検証
    await this.validateMetadataFiles();
  }

  async validateMetadataFiles() {
    const metadataDir = path.join(PROCESSED_DIR, 'metadata');
    const metadataFiles = ['areas.json', 'categories.json', 'versions.json'];

    for (const file of metadataFiles) {
      const filePath = path.join(metadataDir, file);
      try {
        await fs.readJson(filePath);
        console.log(`✓ ${file}: Valid metadata file`);
      } catch (error) {
        this.addError(file, null, 'file', `Invalid metadata file: ${error.message}`);
        console.log(`✗ ${file}: Invalid metadata file`);
      }
    }
  }

  printSummary() {
    console.log('\n=== Validation Summary ===');
    console.log(`Total files validated: ${this.stats.totalFiles}`);
    console.log(`Total items validated: ${this.stats.totalItems}`);
    console.log(`Valid items: ${this.stats.validItems}`);
    console.log(`Items with errors: ${this.stats.errorItems}`);
    console.log(`Items with warnings: ${this.stats.warningItems}`);
    console.log(`Total errors: ${this.errors.length}`);
    console.log(`Total warnings: ${this.warnings.length}`);

    if (this.errors.length > 0) {
      console.log('\n=== Errors ===');
      this.errors.slice(0, 10).forEach((error, index) => {
        console.log(`${index + 1}. ${error.file}:${error.itemIndex} - ${error.field}: ${error.message}`);
      });
      
      if (this.errors.length > 10) {
        console.log(`... and ${this.errors.length - 10} more errors`);
      }
    }

    if (this.warnings.length > 0) {
      console.log('\n=== Warnings ===');
      this.warnings.slice(0, 10).forEach((warning, index) => {
        console.log(`${index + 1}. ${warning.file}:${warning.itemIndex} - ${warning.field}: ${warning.message}`);
      });
      
      if (this.warnings.length > 10) {
        console.log(`... and ${this.warnings.length - 10} more warnings`);
      }
    }

    console.log('\n=== Result ===');
    if (this.errors.length === 0) {
      console.log('✓ All data files are valid!');
      return true;
    } else {
      console.log(`✗ Validation failed with ${this.errors.length} errors`);
      return false;
    }
  }
}

async function validateData() {
  const validator = new DataValidator();
  await validator.validateAllFiles();
  const isValid = validator.printSummary();
  
  if (!isValid) {
    process.exit(1);
  }
}

if (require.main === module) {
  validateData();
}

module.exports = { DataValidator, validateData };