import { describe, expect, it } from "vite-plus/test";
import {
  folderDragRange,
  moveFolder,
  projectOrderAfterFolderMove,
  resolveFolderDropIndex,
} from "./Sidebar.folderDrag";

const folder = (projectKey: string, tier: "pinned" | "open" | "archived" = "open") => ({
  projectKey,
  pinned: tier === "pinned",
  archived: tier === "archived",
});

describe("folderDragRange", () => {
  it("keeps a folder among folders of its own tier", () => {
    const folders = [
      folder("a", "pinned"),
      folder("b", "pinned"),
      folder("c"),
      folder("d"),
      folder("e"),
      folder("f", "archived"),
    ];
    expect(folderDragRange(folders, "b")).toEqual({ start: 0, end: 2 });
    expect(folderDragRange(folders, "d")).toEqual({ start: 2, end: 5 });
  });

  it("does not drag a folder that is alone in its tier", () => {
    expect(folderDragRange([folder("a", "pinned"), folder("b")], "b")).toBeNull();
    expect(folderDragRange([folder("a")], "missing")).toBeNull();
  });
});

describe("moveFolder", () => {
  it("moves the keyed item to the index", () => {
    const keys = ["a", "b", "c", "d"];
    expect(moveFolder(keys, (key) => key, "a", 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveFolder(keys, (key) => key, "d", 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveFolder(keys, (key) => key, "b", 1)).toEqual(keys);
  });
});

describe("resolveFolderDropIndex", () => {
  const range = { start: 0, end: 3 };
  // Three collapsed 32px folders; "b" sits in the middle slot.
  const headers = [
    { projectKey: "a", top: 0, height: 32 },
    { projectKey: "b", top: 32, height: 32 },
    { projectKey: "c", top: 64, height: 32 },
  ];
  const drop = (pointerY: number, layout = headers) =>
    resolveFolderDropIndex({
      headers: layout,
      draggedKey: "b",
      draggedBlockHeight: 32,
      pointerY,
      range,
    });

  it("lands where the pointer is among the other folders", () => {
    expect(drop(5)).toBe(0);
    expect(drop(40)).toBe(1);
    expect(drop(90)).toBe(2);
  });

  it("answers the same whichever slot the preview put the dragged folder in", () => {
    // After the preview moved "b" last, the pointer at the same height still lands it last.
    const moved = [
      { projectKey: "a", top: 0, height: 32 },
      { projectKey: "c", top: 32, height: 32 },
      { projectKey: "b", top: 64, height: 32 },
    ];
    for (const pointerY of [5, 20, 40, 60, 90]) {
      expect(drop(pointerY, moved)).toBe(drop(pointerY));
    }
  });

  it("stays inside the folder's tier", () => {
    expect(
      resolveFolderDropIndex({
        headers,
        draggedKey: "b",
        draggedBlockHeight: 32,
        pointerY: 500,
        range: { start: 0, end: 2 },
      }),
    ).toBe(1);
  });
});

describe("projectOrderAfterFolderMove", () => {
  const group = (projectKey: string, ...members: string[]) => ({
    projectKey,
    memberProjects: (members.length > 0 ? members : [projectKey]).map((physicalProjectKey) => ({
      physicalProjectKey,
    })),
  });

  it("swaps folders into each other's places and keeps other groups where they are", () => {
    expect(
      projectOrderAfterFolderMove({
        groups: [group("a"), group("hidden"), group("b", "b1", "b2"), group("c")],
        folderKeys: ["c", "a", "b"],
        savedOrder: [],
      }),
    ).toEqual(["c", "hidden", "a", "b1", "b2"]);
  });

  it("keeps saved keys of projects that are not listed right now", () => {
    expect(
      projectOrderAfterFolderMove({
        groups: [group("a"), group("b")],
        folderKeys: ["b", "a"],
        savedOrder: ["offline", "a", "b"],
      }),
    ).toEqual(["b", "a", "offline"]);
  });
});
