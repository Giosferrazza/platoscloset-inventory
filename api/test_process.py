from process_inventory import process_inventory_report
import time

print("Starting test...")
start = time.time()

result = process_inventory_report(
    "../assets/data/PlatosExcel.xlsx",
    return_full_monthly=False
)

print(f"Done in {round(time.time() - start, 2)} seconds")

print("\nSUMMARY:")
print(result["summary"])

print("\nCURRENT RECORD COUNT:")
print(len(result["currentInventory"]))

print("\nMONTHLY CHART RECORD COUNT:")
print(len(result["monthlyInventory"]))

print("\nFIRST CURRENT RECORD:")
print(result["currentInventory"][0])

print("\nFIRST MONTHLY CHART RECORD:")
print(result["monthlyInventory"][0])