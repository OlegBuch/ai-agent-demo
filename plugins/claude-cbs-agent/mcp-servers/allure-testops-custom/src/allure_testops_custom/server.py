"""MCP server entry point. Registers all 13 tools (4 test-case, 4 launch/results/statistics,
5 metadata) with the official mcp SDK's MCPServer, run over stdio - see
docs/architecture/2026-09-01-allure-testops-custom-design.md Section 3.2 for the full tool table.
"""

from __future__ import annotations

from mcp.server import MCPServer

from allure_testops_custom.index import ProjectIndex
from allure_testops_custom.native_client import NativeClient
from allure_testops_custom.rest_client import RestClient
from allure_testops_custom.tools.launches import build_launch_tools
from allure_testops_custom.tools.metadata import build_metadata_tools
from allure_testops_custom.tools.test_cases import build_test_case_tools

mcp = MCPServer("allure-testops-custom")

_native_client = NativeClient()
_rest_client = RestClient()
_index = ProjectIndex(_native_client)

_all_tools = {
    **build_test_case_tools(_index),
    **build_launch_tools(_rest_client),
    **build_metadata_tools(_rest_client),
}

for _name, _handler in _all_tools.items():
    mcp.add_tool(_handler, name=_name)


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
