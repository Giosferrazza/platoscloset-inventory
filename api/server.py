from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import shutil
import tempfile

from process_inventory import process_inventory_report

app = FastAPI(title="Plato's Closet Inventory API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten later for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def health_check():
    return {"status": "ok", "message": "Inventory API is running"}


@app.post("/api/process-inventory")
async def process_inventory(file: UploadFile = File(...)):
    allowed_extensions = [".xlsx", ".xls"]

    file_ext = Path(file.filename).suffix.lower()

    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail="Only Excel files are supported right now."
        )

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp:
            shutil.copyfileobj(file.file, tmp)
            temp_path = tmp.name

        result = process_inventory_report(
            temp_path,
            return_full_monthly=False
        )

        return result

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Processing failed: {str(e)}"
        )