"""
MCP tool layer (CLAUDE.md §8, ADR-009). All external integrations live here as
self-describing tools resolved per-client via the registry. New source = new tool +
registry entry, never an inline vendor call in an agent. Implemented in Phase 5
(MCP_ARCHITECTURE.md).
"""
