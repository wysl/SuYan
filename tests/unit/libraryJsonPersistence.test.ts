import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getLibraryBackupPaths,
  readLibraryJsonWithBackupRestore,
  writeLibraryJsonAtomically,
} from "../../electron/main/library/libraryJsonPersistence";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

async function makeLibraryPath(label: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `suyan-library-json-${label}-`));
  temporaryDirectories.push(root);
  await fs.mkdir(path.join(root, "library"), { recursive: true });
  return path.join(root, "library", "library.json");
}

describe("libraryJsonPersistence", () => {
  it("writes library.json via temp file and keeps no leftover tmp", async () => {
    const libraryPath = await makeLibraryPath("atomic");
    await writeLibraryJsonAtomically(libraryPath, JSON.stringify({ schemaVersion: 2, items: [], updatedAt: "t1" }));

    expect(await fs.readFile(libraryPath, "utf8")).toContain('"schemaVersion":2');
    const entries = await fs.readdir(path.dirname(libraryPath));
    expect(entries.some((entry) => entry.endsWith(".tmp"))).toBe(false);
  });

  it("rotates rolling backups newest to oldest across writes", async () => {
    const libraryPath = await makeLibraryPath("rotate");
    const backups = getLibraryBackupPaths(libraryPath);

    await writeLibraryJsonAtomically(libraryPath, "v1");
    await writeLibraryJsonAtomically(libraryPath, "v2");
    await writeLibraryJsonAtomically(libraryPath, "v3");
    await writeLibraryJsonAtomically(libraryPath, "v4");

    expect(await fs.readFile(libraryPath, "utf8")).toBe("v4");
    expect(await fs.readFile(backups[0], "utf8")).toBe("v3");
    expect(await fs.readFile(backups[1], "utf8")).toBe("v2");
    expect(await fs.readFile(backups[2], "utf8")).toBe("v1");
  });

  it("restores library.json from the newest non-empty backup when primary is missing", async () => {
    const libraryPath = await makeLibraryPath("restore-missing");
    const backups = getLibraryBackupPaths(libraryPath);
    await fs.writeFile(backups[0], JSON.stringify({ schemaVersion: 2, items: [{ id: "a" }], updatedAt: "t" }), "utf8");

    const result = await readLibraryJsonWithBackupRestore(libraryPath);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.restoredFromBackup).toBe(backups[0]);
    expect(await fs.readFile(libraryPath, "utf8")).toContain('"id":"a"');
  });

  it("skips empty primary content and restores from backup", async () => {
    const libraryPath = await makeLibraryPath("restore-empty");
    const backups = getLibraryBackupPaths(libraryPath);
    await fs.writeFile(libraryPath, "   \n", "utf8");
    await fs.writeFile(backups[1], '{"schemaVersion":2,"items":[],"updatedAt":"from-bak-1"}', "utf8");

    const result = await readLibraryJsonWithBackupRestore(libraryPath);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.restoredFromBackup).toBe(backups[1]);
    expect(await fs.readFile(libraryPath, "utf8")).toContain("from-bak-1");
  });
});
