# platoscloset-inventory

## Data Processing Architecture

The runtime path is Vercel-friendly JavaScript only:

- Frontend reads the uploaded CSV as text
- Frontend posts `csvText` to `/api/process-inventory`
- `api/process-inventory.js` parses and processes the CSV in Node
- The API returns JSON for the dashboard to render

Shared processor:

- `scripts/winmark-processor.js`

Response shape includes:

- `factRecords`
- `aiSummary`
- `months`
- `latestMonth`
- `flags`
- `summary`
- `buy_breakdown`
- `inventory_aging`
- `top_categories`

## Manual export

If you want to produce the clean JSON file locally, run:

```bash
node -e "const fs=require('fs'); const {processWinmarkCsv}=require('./scripts/winmark-processor'); const csv=fs.readFileSync('path/to/winmark.csv','utf8'); const out=processWinmarkCsv(csv,{logColumns:true}); fs.mkdirSync('data',{recursive:true}); fs.writeFileSync('data/clean.json', JSON.stringify({summary:out.summary,buy_breakdown:out.buy_breakdown,inventory_aging:out.inventory_aging,top_categories:out.top_categories}, null, 2));"
```