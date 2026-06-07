"""
Base tool pattern (CLAUDE.md §8; permitted addition per PROJECT_STRUCTURE.md §4).

Stub — implemented in Phase 5 (MCP_ARCHITECTURE.md §2). Tools subclass langchain
BaseTool, declare a Pydantic args_schema (client_id always explicit), fetch + decrypt
per-client credentials (SR-04), call the vendor, and return NORMALIZED output.
"""
