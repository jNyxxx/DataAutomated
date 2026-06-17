import asyncio
import os
import sys

sys.path.insert(0, "/app")

from app import database
from app.services.ingestion_service import run_ingestion
from app.agents.voc_agent import run_voc_analysis

async def run():
    await database.init_pool()
    try:
        async with database.pool.acquire() as conn:
            client_id = await conn.fetchval("SELECT id FROM clients LIMIT 1")
        if not client_id:
            print("No client found")
            return
            
        print(f"Triggering ingestion for client {client_id}...")
        result = await run_ingestion(client_id)
        print("Ingestion result:", result)
        
        print("Running VoC analysis...")
        await run_voc_analysis(client_id)
        print("VoC analysis complete.")
        
        from app.agents.comp_signal_agent import run_comp_signal_analysis
        print("Running Comp Signal analysis...")
        await run_comp_signal_analysis(client_id)
        print("Comp Signal analysis complete.")
    finally:
        await database.close_pool()

if __name__ == "__main__":
    asyncio.run(run())
