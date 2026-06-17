import asyncio
import asyncpg
from passlib.context import CryptContext

ctx = CryptContext(schemes=['bcrypt'], deprecated='auto')
new_hash = ctx.hash('testpass123!')
print('New hash:', new_hash)

async def update():
    conn = await asyncpg.connect('postgresql://dataautomated:dataautomated@da_db:5432/dataautomated')
    await conn.execute('UPDATE users SET hashed_password = $1 WHERE email = $2', new_hash, 'test@example.com')
    print('Updated DB')
    await conn.close()

asyncio.run(update())
