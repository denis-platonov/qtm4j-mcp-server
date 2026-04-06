# qtm4j-mcp-server

[![CI](https://github.com/denis-platonov/qtm4j-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/denis-platonov/qtm4j-mcp-server/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/%40denis-platonov%2Fqtm4j-mcp-server)](https://www.npmjs.com/package/@denis-platonov/qtm4j-mcp-server)
[![Release](https://img.shields.io/badge/release-none-lightgrey)](https://github.com/denis-platonov/qtm4j-mcp-server/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

MCP server for **QTM4J** (QMetry Test Management for Jira) Open API at `qtmcloud.qmetry.com/rest/api/latest`.

Published package: `@denis-platonov/qtm4j-mcp-server`

MCP Registry name: `io.github.denis-platonov/qtm4j`

## Supported Clients

| Client | Status | Notes |
|--------|--------|-------|
| Cursor | Supported | Configure with `npx` in `~/.cursor/mcp.json` |
| JetBrains IDEs | Supported | Configure in AI Assistant MCP settings |
| VS Code | Supported | Configure in `.vscode/mcp.json` or user profile `mcp.json` |
| Antigravity | Supported | Configure in `mcp_config.json` via raw config |

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

### Use with Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "qtm4j": {
      "command": "npx",
      "args": ["-y", "@denis-platonov/qtm4j-mcp-server"],
      "env": {
        "QTM4J_API_KEY": "your-api-key",
        "QTM4J_BASE_URL": "https://qtmcloud.qmetry.com/rest/api/latest",
        "QTM4J_PROJECT_ID": "10800"
      }
    }
  }
}
```

### Use with JetBrains IDEs

In JetBrains AI Assistant, open `Tools > AI Assistant > Model Context Protocol (MCP)` and add:

```json
{
  "mcpServers": {
    "qtm4j": {
      "command": "npx",
      "args": ["-y", "@denis-platonov/qtm4j-mcp-server"],
      "env": {
        "QTM4J_API_KEY": "your-api-key",
        "QTM4J_BASE_URL": "https://qtmcloud.qmetry.com/rest/api/latest",
        "QTM4J_PROJECT_ID": "10800"
      }
    }
  }
}
```

Restart AI Assistant after saving the configuration.

### Use with VS Code

Add this to your user or workspace MCP configuration file, typically `.vscode/mcp.json` or your profile-level `mcp.json`:

```json
{
  "servers": {
    "qtm4j": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@denis-platonov/qtm4j-mcp-server"],
      "env": {
        "QTM4J_API_KEY": "your-api-key",
        "QTM4J_BASE_URL": "https://qtmcloud.qmetry.com/rest/api/latest",
        "QTM4J_PROJECT_ID": "10800"
      }
    }
  }
}
```

### Use with Antigravity

In Antigravity, open `Manage MCP Servers` and then `View raw config`, then add this to `mcp_config.json`:

```json
{
  "mcpServers": {
    "qtm4j": {
      "command": "npx",
      "args": ["-y", "@denis-platonov/qtm4j-mcp-server"],
      "env": {
        "QTM4J_API_KEY": "your-api-key",
        "QTM4J_BASE_URL": "https://qtmcloud.qmetry.com/rest/api/latest",
        "QTM4J_PROJECT_ID": "10800"
      }
    }
  }
}
```

### Build

```bash
npm install
npm run build
```

### Testing

Run the hermetic test suite:

```bash
npm test
```

Run once without watch mode:

```bash
npm run test:run
```

Generate a coverage report:

```bash
npm run test:coverage
```

Run opt-in live integration tests against a real QTM4J environment:

```bash
npm run test:live
```

Live tests are skipped unless the required environment is present. The live suite currently supports:

- Read-focused checks using `QTM4J_API_KEY`, `QTM4J_BASE_URL`, and `QTM4J_PROJECT_ID`
- Search coverage with `QTM4J_LIVE_TEST_CASE_KEY`
- Cycle listing coverage with `QTM4J_LIVE_TEST_CYCLE_ID`
- Attachment URL coverage with `QTM4J_LIVE_TEST_EXECUTION_ID`
- Optional mutation checks only when `QTM4J_LIVE_ENABLE_MUTATIONS=1`

Example:

```bash
QTM4J_API_KEY=your-api-key \
QTM4J_PROJECT_ID=10800 \
QTM4J_LIVE_TEST_CASE_KEY=PE26-TC-2 \
QTM4J_LIVE_TEST_CYCLE_ID=PE26-R1 \
QTM4J_LIVE_TEST_EXECUTION_ID=12345 \
npm run test:live
```

### Local Development

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

### Publish

1. Log into npm:

```bash
npm login
```

2. Build and verify the package contents:

```bash
npm run build
npm pack --dry-run
```

3. Publish the package:

```bash
npm publish
```

4. Push this project to `https://github.com/denis-platonov/qtm4j-mcp-server` so the repository metadata resolves correctly.

5. Install `mcp-publisher` and log into the MCP Registry with GitHub:

```bash
brew install mcp-publisher
mcp-publisher login github
```

6. Publish the server metadata:

```bash
mcp-publisher publish
```

You can then verify discovery with:

```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.denis-platonov/qtm4j"
```

### GitHub Actions

This repo includes two workflows:

- `CI`: runs `npm run build`, `npm run test:run`, and `npm run test:coverage` on pushes to `main` and on pull requests
- `Release`: runs on tags matching `v*`, verifies the tag matches `package.json` and `server.json`, publishes to npm, and then publishes `server.json` to the MCP Registry

To use the release workflow, add this repository secret:

- `NPM_TOKEN`: npm access token with permission to publish `@denis-platonov/qtm4j-mcp-server`

Then cut a release like this:

```bash
git tag v1.0.0
git push origin v1.0.0
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `QTM4J_API_KEY` | Yes | — | QTM4J Open API key |
| `QTM4J_BASE_URL` | No | `https://qtmcloud.qmetry.com/rest/api/latest` | API base URL |
| `QTM4J_PROJECT_ID` | No | — | Default project ID (avoids passing it in every call) |
| `NODE_TLS_REJECT_UNAUTHORIZED` | No | — | Set to `0` for self-signed certs |
