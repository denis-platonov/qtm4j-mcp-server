/**
 * Variant A: place every test case under a single project root folder (defaults to the repo folder name),
 * mirroring paths under src/test/groovy/tests/…; heuristics for cases without a PE key in code.
 * Missing folders are created with the same API as MCP create_test_case_folder.
 *
 * Required: QTM4J_API_KEY, QTM4J_PROJECT_ID (default 10800).
 * QMetry root folder name: QMETRY_PROJECT_FOLDER_NAME (else basename(REPO_ROOT), e.g. qa-all-in-one).
 *
 * Dry-run: npm run folder-migrate
 * Apply:   QTM4J_FOLDER_MIGRATE_APPLY=1 npm run folder-migrate
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QTM4JClient } from "../dist/qtm4j-client.js";
import { loadConfig } from "../dist/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROJECT_ID = Number(process.env.QTM4J_PROJECT_ID ?? "10800");
const APPLY = process.env.QTM4J_FOLDER_MIGRATE_APPLY === "1";
const REPO_ROOT = process.env.REPO_ROOT
  ? path.resolve(process.env.REPO_ROOT)
  : path.resolve(__dirname, "../../..");

/** QMetry root folder name = project / repository name */
const REPO_FOLDER_NAME =
  process.env.QMETRY_PROJECT_FOLDER_NAME?.trim() || path.basename(REPO_ROOT);

/** @type {{ re: RegExp, rel: string }[]} — first match wins; rel under tests/ */
const HEURISTIC_RULES = [
  { re: /customer-authentication|\bCAM\b/i, rel: "ccom/api/cam" },
  { re: /healthapi|health api|healthapi spec/i, rel: "ccom/api/mds" },
  { re: /zipcode|email validation|start.?session|mds\b|credential|subscription|offers|passive|customer profile|finalize|goals|username|consent|setup subscription|user consent|get offers|create credential/i, rel: "ccom/api/mds" },
  { re: /^lex|lex |snapshot|osu|kba|enrollment|credit snapshot|legal agreements|non-serviceable|chat can be initiated/i, rel: "lex/web" },
  { re: /ccom.*sign|cc.?om.*web|^signup\b|sign.?in.*ccom/i, rel: "ccom/web" },
  { re: /crcom.*(mds|start.?session|zipcode|email|validation|username|credential|offers)/i, rel: "crcom/api/mds" },
  { re: /\bcrcom\b/i, rel: "crcom/web" },
  { re: /ios.*smoke|iphone|ios mobile/i, rel: "ccom/ios" },
  { re: /android.*smoke|android mobile/i, rel: "ccom/android" },
  { re: /mobile.?web/i, rel: "ccom/mobile-web" },
];

function walkGroovyTests(testsRoot, visit) {
  const stack = [testsRoot];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) stack.push(p);
      else if (ent.name.endsWith(".groovy")) visit(p);
    }
  }
}

/** @returns {Record<string, string>} key -> rel path under tests/ e.g. ccom/api/cam */
function buildKeyToRelFromRepo(testsRoot) {
  /** @type {Record<string, string>} */
  const map = {};
  walkGroovyTests(testsRoot, (filePath) => {
    const relDir = path.relative(testsRoot, path.dirname(filePath)).replace(/\\/g, "/");
    let text;
    try {
      text = fs.readFileSync(filePath, "utf8");
    } catch {
      return;
    }
    const re = /PE26-TC-\d+/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const key = m[0];
      if (map[key] && map[key] !== relDir) {
        console.warn(`WARN: key ${key} in multiple dirs: ${map[key]} vs ${relDir} (keeping first)`);
      } else {
        map[key] = relDir;
      }
    }
  });
  return map;
}

function relToFlatPath(rel, rootName) {
  if (!rel || rel === ".") return rootName;
  const parts = rel.split("/").filter(Boolean);
  return `${rootName} / ${parts.join(" / ")}`;
}

/** @param {unknown} raw */
function extractCreatedId(raw) {
  const o =
    raw && typeof raw === "object" && raw !== null && "data" in raw && (/** @type {any} */ (raw).data)
      ? (/** @type {any} */ (raw).data)
      : raw;
  if (o && typeof o === "object" && o !== null && "id" in o) {
    const n = Number(/** @type {{ id: unknown }} */ (o).id);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Ensures folder chain under project root; returns leaf folder id, or null (dry-run / missing folders).
 * @param {Map<string, number>} pathToId
 * @param {Array<{ id: number, name: string, path: string }>} flatFolders
 */
async function ensureLeafUnderProjectRoot(
  client,
  projectId,
  pathToId,
  flatFolders,
  rootName,
  rootId,
  rel,
  apply
) {
  const parts = rel.split("/").filter(Boolean);
  let parentId = rootId;
  let currentPath = rootName;
  for (const seg of parts) {
    const nextPath = `${currentPath} / ${seg}`;
    let id = pathToId.get(nextPath);
    if (id != null) {
      parentId = id;
      currentPath = nextPath;
      continue;
    }
    if (!apply) {
      console.error(`[DRY-RUN] missing folder (would be created on APPLY): ${nextPath}`);
      return null;
    }
    const raw = await client.createTestCaseFolder(projectId, seg, parentId);
    id = extractCreatedId(raw);
    if (id == null) {
      throw new Error(`createTestCaseFolder did not return id: ${JSON.stringify(raw)}`);
    }
    pathToId.set(nextPath, id);
    flatFolders.push({ id, name: seg, path: nextPath });
    parentId = id;
    currentPath = nextPath;
  }
  return parentId;
}

/**
 * Project tree root in QMetry (path is a single segment = project name).
 * @param {Array<{ id: number, name: string, path: string }>} flatFolders
 */
function findProjectRootFolder(flatFolders, name) {
  return flatFolders.find((f) => f.path === name) ?? null;
}

/**
 * @param {Array<{ id: number, name: string, path: string }>} flatFolders
 */
function buildPathToId(flatFolders) {
  /** @type {Map<string, number>} */
  const m = new Map();
  for (const f of flatFolders) {
    if (f.path) m.set(f.path, f.id);
  }
  return m;
}

function classifyRelFromSummary(summary) {
  const s = summary || "";
  for (const { re, rel } of HEURISTIC_RULES) {
    if (re.test(s)) return rel;
  }
  return null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const cfg = loadConfig(process.env);
  const projectId = Number.isFinite(cfg.defaultProjectId) ? cfg.defaultProjectId : PROJECT_ID;
  const client = new QTM4JClient(cfg.baseUrl, cfg.apiKey);

  const testsRoot = path.join(REPO_ROOT, "src/test/groovy/tests");
  if (!fs.existsSync(testsRoot)) {
    console.error("Missing tests root:", testsRoot);
    process.exit(1);
  }

  const keyToRel = buildKeyToRelFromRepo(testsRoot);
  console.error("Keys from repo:", Object.keys(keyToRel).length, "(sample)", Object.entries(keyToRel).slice(0, 5));

  const folderPayload = await client.listTestCaseFoldersWithFlat(projectId, false);
  const flatFolders = Array.isArray(folderPayload.flatFolders) ? folderPayload.flatFolders : [];
  const pathToId = buildPathToId(flatFolders);

  const rootFolder = findProjectRootFolder(flatFolders, REPO_FOLDER_NAME);
  if (!rootFolder) {
    console.error("Root folder not found in QMetry (create it or set QMETRY_PROJECT_FOLDER_NAME):", REPO_FOLDER_NAME);
    process.exit(1);
  }
  const rootFolderId = rootFolder.id;
  const rootPathPrefix = `${REPO_FOLDER_NAME} /`;

  const list = await client.listAllProjectTestCases({
    projectId,
    maxResultsPerPage: 100,
    maxPages: 100,
  });

  const rows = Array.isArray(list.data) ? list.data : [];
  console.error("Test cases to process:", rows.length, APPLY ? "(APPLY)" : "(DRY-RUN)");

  /** @type {{ key: string, summary: string, reason: string }[]} */
  const unclassified = [];
  /** @type {{ key: string, action: string }[]} */
  const planned = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = /** @type {{ id?: string, key?: string, version?: { versionNo?: number } }} */ (row);
    const id = r.id;
    const key = typeof r.key === "string" ? r.key : "";
    if (!id) continue;
    const versionNo = r.version?.versionNo ?? 1;

    await sleep(80);
    let details;
    try {
      details = await client.getTestCaseVersionDetails(id, versionNo, projectId);
    } catch (e) {
      console.error("FAIL details", key || id, e);
      continue;
    }
    const d = /** @type {{ summary?: string, folders?: { id: number, name: string }[] }} */ (
      details && typeof details === "object" && "data" in details ? details.data : details
    );
    const summary = typeof d?.summary === "string" ? d.summary : "";
    const folders = Array.isArray(d?.folders) ? d.folders : [];

    let rel = keyToRel[key] ?? null;
    let reason = rel ? "repo" : "";
    if (!rel) {
      rel = classifyRelFromSummary(summary);
      reason = rel ? "heuristic" : "";
    }
    if (!rel) {
      unclassified.push({ key: key || id, summary: summary.slice(0, 120), reason: "no rule" });
      continue;
    }

    const targetPath = relToFlatPath(rel, REPO_FOLDER_NAME);
    let targetId = pathToId.get(targetPath);
    if (targetId == null) {
      if (APPLY) {
        const created = await ensureLeafUnderProjectRoot(
          client,
          projectId,
          pathToId,
          flatFolders,
          REPO_FOLDER_NAME,
          rootFolderId,
          rel,
          true
        );
        if (created == null) {
          unclassified.push({
            key: key || id,
            summary: summary.slice(0, 80),
            reason: `failed to create folder chain: ${targetPath}`,
          });
          continue;
        }
        targetId = created;
      } else {
        planned.push({
          key: key || id,
          action: `dry-run: would create folders if needed, then set ${targetPath}`,
        });
        continue;
      }
    }

    const currentIds = new Set(folders.map((f) => f.id));
    const removeIds = [];
    for (const f of folders) {
      const p = flatFolders.find((x) => x.id === f.id)?.path ?? "";
      if (!p.startsWith(rootPathPrefix)) {
        removeIds.push(f.id);
      } else if (f.id !== targetId) {
        removeIds.push(f.id);
      }
    }

    const needsAdd = !currentIds.has(targetId);
    if (removeIds.length === 0 && !needsAdd) {
      planned.push({ key: key || id, action: "ok" });
      continue;
    }

    const action = `${needsAdd ? `add ${targetId}` : "no add"}; remove [${removeIds.join(",")}]`;
    planned.push({ key: key || id, action });

    if (APPLY) {
      await sleep(120);
      await client.updateTestCaseFolders(id, versionNo, projectId, needsAdd ? [targetId] : undefined, removeIds.length ? removeIds : undefined);
      console.error("UPDATED", key, action);
    }
  }

  const changed = planned.filter((p) => p.action !== "ok");
  const ok = planned.filter((p) => p.action === "ok");

  console.log(JSON.stringify({ apply: APPLY, ok: ok.length, toChange: changed.length, unclassified: unclassified.length }, null, 2));
  if (unclassified.length) {
    console.log("\n--- Unclassified / missing folder (review) ---\n");
    console.log(JSON.stringify(unclassified.slice(0, 50), null, 2));
    if (unclassified.length > 50) console.log(`... and ${unclassified.length - 50} more`);
  }
  if (!APPLY && changed.length) {
    console.log("\n--- Planned changes (first 40) ---\n");
    console.log(JSON.stringify(changed.slice(0, 40), null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
