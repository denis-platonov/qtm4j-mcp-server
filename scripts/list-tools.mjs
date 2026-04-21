#!/usr/bin/env node
/**
 * Lists tool names from the built server (run `npm run build` first).
 * Use this to confirm your Cursor config is pointing at this checkout.
 */
import { TOOL_DEFINITIONS } from "../dist/tools.js";

const names = Object.keys(TOOL_DEFINITIONS).sort();
console.log(`qtm4j-mcp-server: ${names.length} tools in this build`);
for (const n of names) {
  console.log(`  - ${n}`);
}
