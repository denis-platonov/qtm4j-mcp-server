/**
 * Helpers for testcase folder trees returned by GET /projects/{id}/testcase-folders.
 */

export interface FlatFolder {
  id: number;
  name: string;
  path: string;
}

/** Default path keywords when autoPickFolder is true (merged with folderKeywords). */
export const DEFAULT_FOLDER_KEYWORDS = [
  "lex",
  "web",
  "login",
  "signup",
  "api",
  "ccom",
  "crcom",
  "mds",
  "ui",
  "rsp",
  "mobile",
];

export function extractFolderRoots(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    if (Array.isArray(p.data)) return p.data;
    if (Array.isArray(p.folders)) return p.folders;
    if (Array.isArray(p.testcaseFolders)) return p.testcaseFolders;
  }
  return [];
}

export function flattenFolderNodes(nodes: unknown[], parentPath: string): FlatFolder[] {
  const out: FlatFolder[] = [];
  for (const n of nodes) {
    if (!n || typeof n !== "object") continue;
    const o = n as Record<string, unknown>;
    const id = Number(o.id);
    const name = String(o.name ?? o.folderName ?? "").trim();
    if (!Number.isFinite(id)) continue;
    const path = parentPath ? `${parentPath} / ${name}` : name;
    out.push({ id, name, path });
    const kids =
      (Array.isArray(o.childFolders) ? o.childFolders : null) ??
      (Array.isArray(o.children) ? o.children : null) ??
      (Array.isArray(o.subFolders) ? o.subFolders : null) ??
      [];
    out.push(...flattenFolderNodes(kids as unknown[], path));
  }
  return out;
}

export function scorePath(path: string, keywords: string[]): number {
  const p = path.toLowerCase();
  let s = 0;
  for (const k of keywords) {
    const t = k.trim().toLowerCase();
    if (t && p.includes(t)) s += 1;
  }
  return s;
}

export function pickBestFolder(flat: FlatFolder[], keywords: string[]): FlatFolder | null {
  const kws = keywords.map((k) => k.trim()).filter(Boolean);
  if (flat.length === 0 || kws.length === 0) return null;
  let best: FlatFolder | null = null;
  let bestScore = 0;
  for (const f of flat) {
    const sc = scorePath(f.path, kws);
    if (sc > bestScore) {
      bestScore = sc;
      best = f;
    }
  }
  return bestScore > 0 ? best : null;
}
