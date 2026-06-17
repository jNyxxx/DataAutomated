import asyncio
import json
import asyncpg

async def main():
    conn = await asyncpg.connect('postgresql://dataautomated:change_me_locally@localhost:5432/dataautomated')
    
    print("\n--- DATA SOURCES ---")
    rows = await conn.fetch('SELECT id, source_type, config, is_active FROM data_sources')
    for r in rows:
        print(dict(r))
        
    print("\n--- RAW FEEDBACK ---")
    rows = await conn.fetch('SELECT id, source_type, external_id, processed, content FROM raw_feedback')
    for r in rows:
        print(dict(r))
        
    print("\n--- INSIGHTS ---")
    rows = await conn.fetch('SELECT id, sentiment_score, churn_risk FROM feedback_insights')
    for r in rows:
        print(dict(r))
        
    await conn.close()

asyncio.run(main())
