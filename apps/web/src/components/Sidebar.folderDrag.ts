/**
 * Reordering project folders in the boring sidebar. Folders keep their tiers (pinned projects,
 * then open ones, then archived ones), so a folder only moves among folders of its own tier.
 */

interface FolderTier {
  readonly projectKey: string;
  readonly pinned: boolean;
  readonly archived: boolean;
}

/** The half-open index range of the folders `projectKey` can move among, or null when it cannot move. */
export function folderDragRange(
  folders: readonly FolderTier[],
  projectKey: string,
): { readonly start: number; readonly end: number } | null {
  const index = folders.findIndex((folder) => folder.projectKey === projectKey);
  if (index < 0) return null;
  const { pinned, archived } = folders[index]!;
  const sameTier = (folder: FolderTier) => folder.pinned === pinned && folder.archived === archived;
  let start = index;
  while (start > 0 && sameTier(folders[start - 1]!)) start--;
  let end = index + 1;
  while (end < folders.length && sameTier(folders[end]!)) end++;
  return end - start > 1 ? { start, end } : null;
}

/** `items` with the one keyed `key` moved to `toIndex`. */
export function moveFolder<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  key: string,
  toIndex: number,
): T[] {
  const from = items.findIndex((item) => keyOf(item) === key);
  if (from < 0 || from === toIndex) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, moved!);
  return next;
}

/**
 * Where a dragged folder lands. Headers are measured in the current layout, with the dragged folder
 * already in its previewed slot; positions are read as if that folder were gone, so the answer does
 * not flip back and forth as the preview moves it.
 */
export function resolveFolderDropIndex(input: {
  readonly headers: ReadonlyArray<{
    readonly projectKey: string;
    readonly top: number;
    readonly height: number;
  }>;
  readonly draggedKey: string;
  /** From the dragged header's top to the next header's top: the room its folder takes. */
  readonly draggedBlockHeight: number;
  readonly pointerY: number;
  readonly range: { readonly start: number; readonly end: number };
}): number {
  const dragged = input.headers.find((header) => header.projectKey === input.draggedKey);
  if (dragged === undefined) return input.range.start;
  let index = 0;
  for (const header of input.headers) {
    if (header.projectKey === input.draggedKey) continue;
    const shift = header.top > dragged.top ? input.draggedBlockHeight : 0;
    if (header.top - shift + header.height / 2 < input.pointerY) index++;
  }
  return Math.max(input.range.start, Math.min(index, input.range.end - 1));
}

/**
 * The saved project order after the folders were rearranged into `folderKeys`. Groups that are not
 * folders keep their places, folders take each other's places, and saved keys for projects not
 * listed right now stay at the end.
 */
export function projectOrderAfterFolderMove(input: {
  readonly groups: ReadonlyArray<{
    readonly projectKey: string;
    readonly memberProjects: ReadonlyArray<{ readonly physicalProjectKey: string }>;
  }>;
  readonly folderKeys: readonly string[];
  readonly savedOrder: readonly string[];
}): string[] {
  const folderSet = new Set(input.folderKeys);
  const groupByKey = new Map(input.groups.map((group) => [group.projectKey, group] as const));
  const nextFolder = input.folderKeys[Symbol.iterator]();
  const order = input.groups.flatMap((group) => {
    const placed = folderSet.has(group.projectKey)
      ? (groupByKey.get(nextFolder.next().value!) ?? group)
      : group;
    return placed.memberProjects.map((member) => member.physicalProjectKey);
  });
  const listed = new Set(order);
  return [...order, ...input.savedOrder.filter((key) => !listed.has(key))];
}
