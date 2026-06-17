import asyncio
import json
import asyncpg

async def main():
    conn = await asyncpg.connect('postgresql://dataautomated:change_me_locally@localhost:5433/dataautomated')
    
    async with conn.transaction():
        await conn.execute("SET LOCAL ROLE app_runtime")
        await conn.execute("SELECT set_config('app.current_client_id', '724ec96a-07fa-4b58-9d12-ca7ecbfcac69', TRUE)")
        
        print("\n--- AGENT JOBS ---")
        rows = await conn.fetch('SELECT id, job_type, status, last_error, attempts FROM agent_jobs ORDER BY created_at DESC LIMIT 5')
        for r in rows:
            print(dict(r))
            
    await conn.close()

asyncio.run(main())
