"""
Central tool registry + per-client resolution (CLAUDE.md §8; PROJECT_STRUCTURE.md §4).

Stub — implemented in Phase 5 (MCP_ARCHITECTURE.md §4):
  TOOL_REGISTRY = { "zendesk": ..., "typeform": ..., ... }
  def get_tools_for_client(client_id) -> list  # only the sources the client has connected
A client only ever gets tools for sources they have actually connected (OR-04).
"""
