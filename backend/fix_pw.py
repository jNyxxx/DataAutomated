import asyncio
import asyncpg
from passlib.context import CryptContext

ctx = CryptContext(schemes=['bcrypt'], deprecated='auto')
demo_hash = ctx.hash('Demo1234!')
test_hash = ctx.hash('testpass123!')

async def update():
    conn = await asyncpg.connect('postgresql://dataautomated:change_me_locally@localhost:5433/dataautomated')
    await conn.execute('UPDATE users SET hashed_password = $1 WHERE email = $2', demo_hash, 'demo@dataautomated.io')
    await conn.execute('UPDATE users SET hashed_password = $1 WHERE email = $2', test_hash, 'test@example.com')
    print('Updated DB')
    await conn.close()

asyncio.run(update())
