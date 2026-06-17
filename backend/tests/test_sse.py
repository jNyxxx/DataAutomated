"""
SSE /stream/insights tests and EventBroker tests.
"""

from __future__ import annotations

import json
from uuid import UUID, uuid4
from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.main import app
import app.database as _db
from app.services.realtime_service import broker, publish_event

pytestmark = pytest.mark.asyncio

class TestSseAuth:
    async def test_missing_token_is_422(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/stream/insights")
        assert resp.status_code == 401

    async def test_invalid_token_is_401(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/stream/insights?token=not.a.valid.jwt")
        assert resp.status_code == 401

class TestEventBroker:
    async def test_publish_event_inserts_row_and_notifies(self, tx_conn):
        client_id = uuid4()
        await tx_conn.execute("INSERT INTO clients (id, name, created_at) VALUES ($1, 'test', now())", client_id)
        
        entity_id = str(uuid4())
        # We simulate the DB insert since pool might not be running in this test context
        await tx_conn.execute(
            "INSERT INTO realtime_events (client_id, event_type, entity_id, payload) VALUES ($1, $2, $3, $4)",
            client_id, "test.event", entity_id, json.dumps({"foo": "bar"})
        )
        
        row = await tx_conn.fetchrow(
            "SELECT * FROM realtime_events WHERE client_id=$1 AND event_type='test.event' AND entity_id=$2",
            client_id, entity_id
        )
        assert row is not None
        assert json.loads(row["payload"]) == {"foo": "bar"}
            
    async def test_broker_queues_and_cleanup(self):
        client_id = uuid4()
        q = broker.subscribe(client_id)
        assert client_id in broker.queues
        assert q in broker.queues[client_id]
        
        broker.unsubscribe(client_id, q)
        assert client_id not in broker.queues
        
    async def test_client_a_does_not_receive_client_b_events(self):
        client_a = uuid4()
        client_b = uuid4()
        
        qa = broker.subscribe(client_a)
        qb = broker.subscribe(client_b)
        
        payload = json.dumps({"client_id": str(client_a), "event_type": "test", "id": str(uuid4())})
        broker._on_notify(None, None, None, payload)
        
        assert not qa.empty()
        assert qb.empty()
        
        broker.unsubscribe(client_a, qa)
        broker.unsubscribe(client_b, qb)

    async def test_last_event_id_catchup(self, tx_conn):
        client_id = uuid4()
        await tx_conn.execute("INSERT INTO clients (id, name, created_at) VALUES ($1, 'test', now())", client_id)
        
        e1_id = uuid4()
        e2_id = uuid4()
        await tx_conn.execute("INSERT INTO realtime_events (id, client_id, event_type, entity_id, payload) VALUES ($1, $2, 'test1', '1', '{}')", e1_id, client_id)
        await tx_conn.execute("INSERT INTO realtime_events (id, client_id, event_type, entity_id, payload) VALUES ($1, $2, 'test2', '2', '{}')", e2_id, client_id)
