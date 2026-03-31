# qtm4j-mcp-server

MCP server for **QTM4J** (QMetry Test Management for Jira) Open API at `qtmcloud.qmetry.com/rest/api/latest`.

## Tools

| Tool | Description |
|------|-------------|
| `create_test_cycle` | Create a new test cycle (run) |
| `search_test_case` | Search for a test case by key (e.g. PE26-TC-2) |
| `create_test_case` | Create a new test case |
| `list_cycle_test_cases` | List all test cases in a cycle |
| `add_test_case_to_cycle` | Add a test case to a cycle |
| `update_execution_status` | Update execution result (Pass/Fail) |
| `close_test_cycle` | Close a test cycle |
| `get_attachment_url` | Get presigned URL for attachment upload |

## Setup

### Prerequisites

- Node.js 20+
- QTM4J Open API key (generate from Jira: QMetry > Configuration > Open API)

### Build

```bash
npm install
npm run build
```

### Cursor IDE

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "qtm4j": {
      "command": "node",
      "args": ["/path/to/qtm4j-mcp-server/dist/index.js"],
      "env": {
        "QTM4J_API_KEY": "your-api-key",
        "QTM4J_BASE_URL": "https://qtmcloud.qmetry.com/rest/api/latest",
        "QTM4J_PROJECT_ID": "10800",
        "NODE_TLS_REJECT_UNAUTHORIZED": "0"
      }
    }
  }
}
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `QTM4J_API_KEY` | Yes | — | QTM4J Open API key |
| `QTM4J_BASE_URL` | No | `https://qtmcloud.qmetry.com/rest/api/latest` | API base URL |
| `QTM4J_PROJECT_ID` | No | — | Default project ID (avoids passing it in every call) |
| `NODE_TLS_REJECT_UNAUTHORIZED` | No | — | Set to `0` for self-signed certs |
