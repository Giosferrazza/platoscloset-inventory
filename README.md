# platoscloset-inventory

## Data Processing Architecture

The backend runtime path is Vercel-friendly JavaScript only:

- Frontend reads the uploaded CSV as text
- Frontend posts `csvText` to `/api/process-inventory`
- `api/process-inventory.js` parses and processes the CSV in Node
- The API returns JSON for the dashboard to render

There is no Python/FastAPI backend in this repo. Keep new server-side processing in the Node route or the shared processor below.

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
npm run process -- path/to/winmark.csv --output data/clean.json
```
