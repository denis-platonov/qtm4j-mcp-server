# qtm4j-mcp-server

[![CI](https://github.com/denis-platonov/qtm4j-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/denis-platonov/qtm4j-mcp-server/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/%40denis-platonov%2Fqtm4j-mcp-server)](https://www.npmjs.com/package/@denis-platonov/qtm4j-mcp-server)
[![Release](https://img.shields.io/github/v/release/denis-platonov/qtm4j-mcp-server)](https://github.com/denis-platonov/qtm4j-mcp-server/releases)
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
| `search_test_cases` | Search test cases with pagination and optional summary filters |
| `list_all_project_test_cases` | Fetch and merge paginated test case results across a project |
| `create_test_case` | Create a new test case, optionally placing it in folders |
| `list_cycle_test_cases` | List all test cases in a cycle |
| `add_test_case_to_cycle` | Add a test case to a cycle |
| `update_execution_status` | Update execution result (Pass/Fail) |
| `close_test_cycle` | Close a test cycle |
| `get_attachment_url` | Get presigned URL for attachment upload |
| `add_test_case_steps` | Add one or more steps to a test case version |
| `add_test_case_to_folders` | Add a test case version to one or more folders |
| `create_test_case_folder` | Create a test case folder in a project |
| `get_test_case` | Fetch a test case by ID or key |
| `get_test_case_details` | Fetch full details for a specific test case version |
| `get_test_case_steps` | List or search steps on a test case version |
| `list_test_case_folders` | List project test case folders with flat paths |
| `remove_test_case_from_folders` | Remove a test case version from folders |
| `update_test_case_description` | Update a test case version description |
| `update_test_case_step` | Update an existing test step |
| `update_test_case_summary` | Update a test case version summary |

The full set of tools (including `search_test_cases` with `startAt`, `list_all_project_test_cases`, folder and step helpers) is defined in `src/tools.ts`. After `npm run build`, run `npm run list-tools` to print every registered tool name — use this to confirm Cursor is using **this** build (you should see `list_all_project_test_cases`).

### Cursor: use the local build for full functionality

`npx @denis-platonov/qtm4j-mcp-server` may be an older npm release. To guarantee tools such as **`list_all_project_test_cases`** and correct **`startAt`** handling:

1. In this directory: `npm install && npm run build`.
2. Merge `cursor-mcp.example.json` into your **user** Cursor config `~/.cursor/mcp.json` (Windows: `%USERPROFILE%\.cursor\mcp.json`). Adjust the `args` path to your absolute `dist/index.js`.
3. Run `npm run list-tools` and confirm the tool count matches expectations.
4. Restart Cursor or toggle the MCP server off/on.

### Cursor workspace tool descriptors

If you use Cursor’s workspace `mcps/<server>/tools/*.json` hints for the agent, keep those JSON schemas in sync with `src/tools.ts` (same parameter names as the Zod definitions). Rebuild and restart MCP after changing tools.

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

Copy `cursor-mcp.example.json` into `~/.cursor/mcp.json` (merge with existing `mcpServers`) and set `args` to the absolute path of `dist/index.js`, for example on Windows:

`"args": ["C:/Users/you/projects/qa-all-in-one/tools/qtm4j-mcp-server/dist/index.js"]`

Optional: `NODE_TLS_REJECT_UNAUTHORIZED": "0"` in `env` only if you must use self-signed TLS.

### Publish

This repository uses a tag-driven GitHub Actions release workflow.

1. Align `package.json` and `server.json` to the release version.
2. Build and verify locally:

```bash
npm run build
npm run test:run
```

3. Commit the release-prep changes.
4. Create and push the release tag:

```bash
git tag v1.1.0
git push origin sync/desktop-qtm4j-source
git push origin v1.1.0
```

5. GitHub Actions will verify the tag matches `package.json` and `server.json`, publish the npm package, and then publish `server.json` to the MCP Registry.

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
git tag v1.1.0
git push origin v1.1.0
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `QTM4J_API_KEY` | Yes | — | QTM4J Open API key |
| `QTM4J_BASE_URL` | No | `https://qtmcloud.qmetry.com/rest/api/latest` | API base URL |
| `QTM4J_PROJECT_ID` | No | — | Default project ID (avoids passing it in every call) |
| `NODE_TLS_REJECT_UNAUTHORIZED` | No | — | Set to `0` for self-signed certs |
