# childcare-support-data プロジェクト作業指示

## プロジェクト概要
GovTech東京の子育て支援制度レジストリを基に、Flutter育児アプリ向けに最適化されたデータ配信システムを構築する。

## 作業内容

### 1. リポジトリ初期設定
新しいGitHubリポジトリ `childcare-support-data` を作成し、以下の構造を作成してください：

```
childcare-support-data/
├── README.md
├── data/
│   ├── raw/                     # 元データ（GovTech東京から取得）
│   ├── processed/               # 処理済みデータ
│   │   ├── by-area/            # 地域別分割データ
│   │   ├── by-category/        # カテゴリ別分割データ
│   │   └── metadata/           # メタデータ
├── scripts/
│   ├── fetch-data.js           # データ取得スクリプト
│   ├── process-data.js         # データ分割・処理
│   └── deploy.js               # GitHub Pages/CDNへのデプロイ
├── tools/
│   ├── validator.js            # データ検証ツール
│   └── diff-checker.js         # 差分確認ツール
├── package.json
└── .github/
    └── workflows/
        ├── update-data.yml     # 定期データ更新
        └── deploy.yml          # 自動デプロイ
```

### 2. データ取得スクリプト作成
`scripts/fetch-data.js` を作成し、以下のデータソースから取得：

**メインデータソース:**
- URL: `https://data.storage.data.metro.tokyo.lg.jp/govtech/130001_kosodateshienseido_tokyo.json`
- 保存先: `data/raw/130001_kosodateshienseido_tokyo.json`

**データ構造の確認:**
元データの構造例（最初の50行程度）：
```json
[
  {
    "institutionName": {
      "canonicalName": "定期予防接種",
      "shortName": "DPT-IPV-Hib五種混合（ジフテリア・百日せき・破傷風・ポリオ・ヒブ）"
    },
    "summary": "予防接種には、法令で定められた定期接種と本人が希望して行う任意の予防接種とがあります。",
    "target": {
      "targetPersons": "お子さん\n生後2か月から7歳6か月の誕生日の前日まで",
      "lessThan": {
        "targetAge": 7,
        "targetAgeOfMonths": 6
      },
      "greaterThanOrEqualTo": {
        "targetAge": null,
        "targetAgeOfMonths": 2
      }
    },
    "support": {
      "description": "接種費用\n無料",
      "monetarySupport": "接種費用\n無料",
      "materiallySupport": null
    },
    "area": {
      "areaCode": "131016;千代田区",
      "areaText": null
    },
    "basicInformation": {
      "psid": "psid3.0+9000020131016+10+UM54",
      "organization": "9000020131016"
    }
  }
]
```

### 3. データ処理スクリプト作成
`scripts/process-data.js` を作成し、以下の処理を実装：

#### A. 地域別分割処理
- `area.areaCode` フィールドから地域コードを抽出（セミコロン区切りの最初の部分）
- 地域コードごとにファイル分割
- 出力形式:
```json
{
  "version": "2024-01-01T00:00:00.000Z",
  "areaCode": "131130",
  "areaName": "渋谷区",
  "count": 150,
  "items": [...]
}
```

#### B. カテゴリ別分割処理
`institutionName.canonicalName` を基に以下のカテゴリに分類：
- `vaccination`: 予防接種関連（"予防接種"を含む）
- `childcare`: 保育・一時預かり関連（"保育", "一時預かり"を含む）
- `financial`: 金銭支援関連（"手当", "助成", "給付"を含む）
- `medical`: 医療関連（"健診", "医療"を含む）
- `education`: 教育関連（"教育", "学習"を含む）
- `other`: その他

#### C. メタデータ生成
以下のメタデータファイルを生成：

**areas.json**: 地域一覧
```json
[
  {
    "code": "131130",
    "name": "渋谷区",
    "itemCount": 150,
    "lastUpdated": "2024-01-01T00:00:00.000Z"
  }
]
```

**merged-areas.json**: 東京都と市区町村を結合した地域一覧
```json
[
  {
    "code": "130001_131130",
    "name": "東京都渋谷区",
    "itemCount": 176,  // 東京都(27) + 渋谷区(149)の合計
    "lastUpdated": "2024-01-01T00:00:00.000Z",
    "prefecture": {
      "code": "130001",
      "name": "東京都",
      "itemCount": 27
    },
    "municipality": {
      "code": "131130",
      "name": "渋谷区",
      "itemCount": 149
    }
  }
]
```

**categories.json**: カテゴリ一覧
```json
[
  {
    "id": "vaccination",
    "name": "予防接種",
    "description": "定期予防接種・任意予防接種に関する情報",
    "itemCount": 50
  }
]
```

**versions.json**: バージョン情報
```json
{
  "lastUpdated": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0",
  "sourceUrl": "https://data.storage.data.metro.tokyo.lg.jp/govtech/130001_kosodateshienseido_tokyo.json",
  "totalItems": 500,
  "areas": 23
}
```

### 4. GitHub Actions設定

#### A. 自動データ更新 (update-data.yml)
```yaml
name: Update Support Data
on:
  schedule:
    - cron: '0 6 * * *'  # 毎日6時に実行
  workflow_dispatch:     # 手動実行も可能

jobs:
  update-data:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm install
        
      - name: Fetch latest data
        run: node scripts/fetch-data.js
        
      - name: Process data
        run: node scripts/process-data.js
        
      - name: Validate data
        run: node tools/validator.js
        
      - name: Check for changes
        id: changes
        run: |
          if git diff --quiet data/processed/; then
            echo "changed=false" >> $GITHUB_OUTPUT
          else
            echo "changed=true" >> $GITHUB_OUTPUT
          fi
          
      - name: Commit and push
        if: steps.changes.outputs.changed == 'true'
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"
          git add data/processed/
          git commit -m "Update support data $(date +'%Y-%m-%d %H:%M:%S')"
          git push
```

#### B. 自動デプロイ (deploy.yml)
```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [ main ]
    paths: [ 'data/processed/**' ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pages: write
      id-token: write
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Pages
        uses: actions/configure-pages@v3
        
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v2
        with:
          path: ./data/processed
          
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v2
```

### 5. データ検証ツール作成
`tools/validator.js` を作成し、以下の検証を実装：

#### 必須フィールド検証
- `institutionName.canonicalName`
- `area.areaCode`
- `basicInformation.psid`

#### データ整合性検証
- 地域コードの形式チェック
- 対象年齢データの妥当性
- 重複データの検出

#### 出力例
```
✓ 131130.json: 150 items validated
✗ 131016.json: 2 errors found
  - Item 45: Missing institutionName.canonicalName
  - Item 67: Invalid area.areaCode format
```

### 6. 差分管理ツール作成
`tools/diff-checker.js` を作成し、以下を実装：

#### 変更検出
- 追加されたアイテム
- 削除されたアイテム
- 変更されたアイテム

#### 差分レポート生成
```json
{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "summary": {
    "added": 5,
    "modified": 3,
    "removed": 1
  },
  "changes": {
    "added": [...],
    "modified": [...],
    "removed": [...]
  }
}
```

### 7. README.md作成
プロジェクトの概要、使用方法、API仕様を記載：

```markdown
# 子育て支援データ配信プロジェクト

## 概要
GovTech東京の子育て支援制度レジストリを基に、アプリ開発者向けに最適化されたデータを提供します。

## データアクセス方法

### jsDelivr CDN経由
```
https://cdn.jsdelivr.net/gh/your-username/childcare-support-data@latest/by-area/{areaCode}.json
```

### GitHub Pages経由
```
https://your-username.github.io/childcare-support-data/by-area/{areaCode}.json
```

## 利用可能なエンドポイント

### 地域別データ
- `/by-area/{areaCode}.json` - 指定地域の全データ
- 例: `/by-area/131130.json` (渋谷区)

### カテゴリ別データ
- `/by-category/{category}/{areaCode}.json` - 指定地域・カテゴリのデータ
- 例: `/by-category/vaccination/131130.json`

### メタデータ
- `/metadata/areas.json` - 利用可能地域一覧
- `/metadata/merged-areas.json` - 東京都と市区町村を結合した地域一覧
- `/metadata/categories.json` - カテゴリ一覧
- `/metadata/versions.json` - バージョン情報

## 更新頻度
- 毎日6:00 JST に自動更新
- 元データに変更があった場合のみ配信データを更新
```

### 8. package.json作成
```json
{
  "name": "childcare-support-data",
  "version": "1.0.0",
  "description": "Child care support data distribution system",
  "main": "index.js",
  "scripts": {
    "fetch": "node scripts/fetch-data.js",
    "process": "node scripts/process-data.js",
    "validate": "node tools/validator.js",
    "diff": "node tools/diff-checker.js",
    "build": "npm run fetch && npm run process && npm run validate"
  },
  "dependencies": {
    "axios": "^1.6.0",
    "fs-extra": "^11.1.0",
    "path": "^0.12.7"
  },
  "devDependencies": {
    "nodemon": "^3.0.0"
  }
}
```

## 作業完了後の確認事項

1. **データ取得**: 元データが正常に取得できること
2. **データ処理**: 地域別・カテゴリ別に正しく分割されること
3. **検証**: 全データが妥当性チェックを通過すること
4. **GitHub Actions**: 自動更新・デプロイが正常に動作すること
5. **CDN配信**: jsDelivr経由でデータが取得できること

## 注意事項

- 元データは2.5MB程度の大容量なので、処理時間に注意
- GitHub Actionsの実行時間制限（6時間）内に処理を完了させること
- GitHub Pagesの容量制限（1GB）を超えないよう監視すること
- 個人情報や機密情報が含まれていないことを確認すること

作業完了後、CDNのURLをFlutterアプリ側で利用できるように報告してください。