# platoscloset-inventory

## Data Processing Architecture

The CSV processing pipeline now runs in Python using pandas and numpy:

- Python script: `scripts/process_inventory.py`
- API route that invokes Python: `api/process-inventory.js`
- Frontend caller: `assets/js/app.js`

The browser uploads CSV data, posts it to `/api/process-inventory`, and receives:

- `factRecords`
- `aiSummary`
- `months`
- `latestMonth`
- `flags`

## Python Dependencies

Install Python packages from `requirements.txt`:

```bash
pip install -r requirements.txt
```

Dependencies:

- pandas
- numpy