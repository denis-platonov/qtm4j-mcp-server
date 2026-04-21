import { describe, expect, it } from "vitest";
import {
  extractFolderRoots,
  flattenFolderNodes,
  pickBestFolder,
  scorePath,
} from "../src/folder-utils.js";

describe("folder-utils", () => {
  it("extracts roots from common API shapes", () => {
    expect(extractFolderRoots([{ id: 1 }])).toEqual([{ id: 1 }]);
    expect(extractFolderRoots({ data: [{ id: 2 }] })).toEqual([{ id: 2 }]);
    expect(extractFolderRoots({ folders: [{ id: 3 }] })).toEqual([{ id: 3 }]);
    expect(extractFolderRoots({ testcaseFolders: [{ id: 4 }] })).toEqual([{ id: 4 }]);
    expect(extractFolderRoots({})).toEqual([]);
  });

  it("flattens nested childFolders", () => {
    const flat = flattenFolderNodes(
      [
        {
          id: 1,
          name: "Web",
          childFolders: [{ id: 2, name: "LEX", childFolders: [] }],
        },
      ],
      ""
    );
    expect(flat).toEqual([
      { id: 1, name: "Web", path: "Web" },
      { id: 2, name: "LEX", path: "Web / LEX" },
    ]);
  });

  it("flattens alternate child arrays and skips invalid nodes", () => {
    const flat = flattenFolderNodes(
      [
        null,
        { id: "bad", name: "Skip" },
        {
          id: 1,
          folderName: "Root",
          children: [{ id: 2, name: "Child", subFolders: [{ id: 3, name: "Leaf" }] }],
        },
      ],
      ""
    );

    expect(flat).toEqual([
      { id: 1, name: "Root", path: "Root" },
      { id: 2, name: "Child", path: "Root / Child" },
      { id: 3, name: "Leaf", path: "Root / Child / Leaf" },
    ]);
  });

  it("scores paths by keywords and picks best", () => {
    expect(scorePath("Web / LEX / Login", ["lex", "login"])).toBe(2);
    expect(scorePath("Other", ["lex"])).toBe(0);
    const flat = [
      { id: 1, name: "A", path: "Web / API" },
      { id: 2, name: "B", path: "Web / LEX / Login" },
    ];
    expect(pickBestFolder(flat, ["lex", "login"])?.id).toBe(2);
  });

  it("returns null when pickBestFolder has no usable keywords or no positive score", () => {
    expect(pickBestFolder([], ["lex"])).toBeNull();
    expect(pickBestFolder([{ id: 1, name: "A", path: "Other" }], ["   "])).toBeNull();
    expect(pickBestFolder([{ id: 1, name: "A", path: "Other" }], ["lex"])).toBeNull();
  });
});
