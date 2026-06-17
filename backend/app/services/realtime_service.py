import json
import logging
from uuid import UUID
from typing import Any, Optional, Dict, Set
import asyncio

logger = logging.getLogger("dataautomated.realtime")

class EventBroker:
    def __init__(self):
        self.queues: Dict[UUID, Set[asyncio.Queue]] = {}
        self._conn = None

    def subscribe(self, client_id: UUID) -> asyncio.Queue:
        q = asyncio.Queue(maxsize=100)
        if client_id not in self.queues:
            self.queues[client_id] = set()
        self.queues[client_id].add(q)
        return q

    def unsubscribe(self, client_id: UUID, q: asyncio.Queue) -> None:
        if client_id in self.queues:
            self.queues[client_id].discard(q)
            if not self.queues[client_id]:
                del self.queues[client_id]

    async def start_listening(self):
        from app import database
        if database.pool is None:
            return
        
        while True:
            try:
                # Use raw connection from pool for global listen, NO tenant scope
                self._conn = await database.pool.acquire()
                await self._conn.add_listener("realtime_events_channel", self._on_notify)
                
                # Keep alive until connection breaks or cancelled
                while not self._conn.is_closed():
                    await asyncio.sleep(1)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("EventBroker listener error: %s", e)
                await asyncio.sleep(5)
            finally:
                if self._conn and not self._conn.is_closed():
                    await self._conn.remove_listener("realtime_events_channel", self._on_notify)
                    await database.pool.release(self._conn)
                self._conn = None

    def _on_notify(self, connection, pid, channel, payload):
        try:
            data = json.loads(payload)
            client_id = UUID(str(data.get("client_id")))
            if client_id in self.queues:
                for q in list(self.queues[client_id]):
                    try:
                        q.put_nowait(data)
                    except asyncio.QueueFull:
                        logger.warning("EventBroker queue full for client %s, forcing disconnect", client_id)
                        try:
                            # Drain an item to make room for the disconnect message
                            q.get_nowait()
                            q.put_nowait({"error": "queue_full", "disconnect": True})
                        except Exception:
                            pass
                        self.unsubscribe(client_id, q)
        except Exception as e:
            logger.warning("EventBroker payload parse failed: %s", e)

broker = EventBroker()

async def publish_event(
    client_id: UUID,
    event_type: str,
    entity_id: Optional[str] = None,
    payload: Optional[dict[str, Any]] = None
) -> None:
    """
    Publish a real-time event.
    This inserts a row into the realtime_events table, which triggers a pg_notify.
    Uses acquire_for_client for secure, tenant-scoped insert.
    """
    from app import database
    if database.pool is None:
        logger.warning("Database pool not initialized, skipping event %s", event_type)
        return

    payload_json = json.dumps(payload or {})
    try:
        async with database.acquire_for_client(client_id) as conn:
            await conn.execute(
                "INSERT INTO realtime_events (client_id, event_type, entity_id, payload) "
                "VALUES ($1, $2, $3, $4::jsonb)",
                client_id, event_type, str(entity_id) if entity_id else None, payload_json
            )
    except Exception as e:
        logger.error("Failed to publish real-time event %s: %s", event_type, e)
