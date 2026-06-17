import asyncio
import json
import asyncpg

async def main():
    conn = await asyncpg.connect('postgresql://dataautomated:change_me_locally@localhost:5433/dataautomated')
    
    # Needs to be inside a transaction to use local variables
    async with conn.transaction():
        await conn.execute("SET LOCAL ROLE app_runtime")
        await conn.execute("SELECT set_config('app.current_client_id', '724ec96a-07fa-4b58-9d12-ca7ecbfcac69', TRUE)")
        
        rows = await conn.fetch('SELECT id, source_type, config, credentials FROM data_sources')
        for r in rows:
            print(dict(r))
            
    await conn.close()

asyncio.run(main())
