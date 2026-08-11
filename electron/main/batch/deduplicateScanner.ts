import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { getImagePath } from "../library/libraryPaths";
import { readLibraryFile } from "../library/libraryStore";
import { sha256FileViaRust } from "../runtime/rustFileOps";

export type DeduplicateItem = {
  itemId: string;
  imageFileName: string;
  fileSize: number;
  title: string;
  createdAt: string;
};

export type DeduplicateGroup = {
  hash: string;
  items: DeduplicateItem[];
};

export type DeduplicateResult = {
  groups: DeduplicateGroup[];
  totalDuplicateFiles: number;
  wastedBytes: number;
};

export type HashedItem = {
  hash: string;
  item: DeduplicateItem;
};

export async function scanDuplicates(): Promise<DeduplicateResult> {
  const library = await readLibraryFile();
  const hashedItems = await collectHashedItems(library.items);

  return buildDeduplicateGroups(hashedItems);
}

export function buildDeduplicateGroups(hashedItems: HashedItem[]): DeduplicateResult {
  const groupsByHash = new Map<string, DeduplicateItem[]>();

  for (const { hash, item } of hashedItems) {
    const group = groupsByHash.get(hash);

    if (group) {
      group.push(item);
    } else {
      groupsByHash.set(hash, [item]);
    }
  }

  const groups: DeduplicateGroup[] = [];
  let totalDuplicateFiles = 0;
  let wastedBytes = 0;

  for (const [hash, items] of groupsByHash) {
    if (items.length < 2) {
      continue;
    }

    const groupBytes = items.reduce((sum, item) => sum + item.fileSize, 0);
    const keepBytes = Math.max(...items.map((item) => item.fileSize));

    totalDuplicateFiles += items.length - 1;
    wastedBytes += groupBytes - keepBytes;
    groups.push({ hash, items });
  }

  return { groups, totalDuplicateFiles, wastedBytes };
}

async function collectHashedItems(items: readonly { id: string; imageFileName: string; title: string; createdAt: string }[]): Promise<HashedItem[]> {
  const result: HashedItem[] = [];

  for (const item of items) {
    if (!item.imageFileName) {
      continue;
    }

    try {
      const filePath = getImagePath(item.imageFileName);
      // Rust 实现启用时优先走 Sidecar，分块流式计算，避免整文件读入内存。
      const rustHash = await sha256FileViaRust(filePath);
      let hash: string;
      let fileSize: number;

      if (rustHash) {
        hash = rustHash.hash;
        fileSize = rustHash.size;
      } else {
        const buffer = await fs.readFile(filePath);
        hash = createHash("sha256").update(buffer).digest("hex");
        fileSize = buffer.length;
      }

      result.push({
        hash,
        item: {
          itemId: item.id,
          imageFileName: item.imageFileName,
          fileSize,
          title: item.title,
          createdAt: item.createdAt,
        },
      });
    } catch {
    }
  }

  return result;
}
