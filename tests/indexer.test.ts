/**
 * インデクサーのテスト（差分更新 + マイグレーション）
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, utimesSync } from "fs";
import path from "path";
import { Database } from "bun:sqlite";
import { initVault, getVaultPaths } from "../src/services/vault.ts";
import { rebuildIndex, incrementalIndex } from "../src/services/indexer.ts";

const TEST_VAULT = path.join(import.meta.dir, "../.test-indexer-tmp");

/** テスト用ノートを作成するヘルパー */
function writeNote(filename: string, title: string, content: string): void {
  const filePath = path.join(TEST_VAULT, filename);
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const frontmatter = `---\ntitle: ${title}\ntags: []\ncreated: 2026-03-21T00:00:00+09:00\nupdated: 2026-03-21T00:00:00+09:00\nconfidential: false\nsecurity_flag: clean\n---\n`;
  writeFileSync(filePath, frontmatter + content, "utf-8");
}

/** DBのインデックス件数を取得 */
function getIndexCount(dbPath: string): number {
  const db = new Database(dbPath, { readonly: true });
  const row = db.query("SELECT COUNT(*) as c FROM notes_meta").get() as { c: number };
  db.close();
  return row.c;
}

describe("差分インデックス更新", () => {
  beforeEach(() => {
    if (existsSync(TEST_VAULT)) rmSync(TEST_VAULT, { recursive: true });
    mkdirSync(TEST_VAULT, { recursive: true });
    initVault(TEST_VAULT);
  });

  afterEach(() => {
    if (existsSync(TEST_VAULT)) rmSync(TEST_VAULT, { recursive: true });
  });

  test("初回のincrementalIndexは全件登録する", async () => {
    writeNote("note1.md", "ノート1", "テスト内容その1");
    writeNote("note2.md", "ノート2", "テスト内容その2");

    const paths = getVaultPaths(TEST_VAULT);
    const result = await incrementalIndex(paths);

    expect(result.totalNotes).toBe(2);
    expect(result.indexedNotes).toBe(2);
    expect(result.skippedNotes).toBe(0);
    expect(result.deletedNotes).toBe(0);
    expect(getIndexCount(paths.indexDb)).toBe(2);
  });

  test("変更がなければスキップされる", async () => {
    writeNote("note1.md", "ノート1", "テスト内容");
    const paths = getVaultPaths(TEST_VAULT);

    // 1回目: 全件登録
    await incrementalIndex(paths);

    // 2回目: 変更なし→スキップ
    const result = await incrementalIndex(paths);
    expect(result.indexedNotes).toBe(0);
    expect(result.skippedNotes).toBe(1);
  });

  test("ファイルが更新されたら再インデックスされる", async () => {
    writeNote("note1.md", "ノート1", "元の内容");
    const paths = getVaultPaths(TEST_VAULT);

    await incrementalIndex(paths);

    // ファイルを更新（mtimeを未来に設定して確実に検知させる）
    const future = new Date(Date.now() + 10000);
    writeFileSync(
      path.join(TEST_VAULT, "note1.md"),
      "---\ntitle: ノート1更新\ntags: []\ncreated: 2026-03-21T00:00:00+09:00\nupdated: 2026-03-21T00:00:00+09:00\nconfidential: false\nsecurity_flag: clean\n---\n更新された内容",
      "utf-8"
    );
    utimesSync(path.join(TEST_VAULT, "note1.md"), future, future);

    const result = await incrementalIndex(paths);
    expect(result.indexedNotes).toBe(1);
    expect(result.skippedNotes).toBe(0);
  });

  test("新しいファイルが追加されたら登録される", async () => {
    writeNote("note1.md", "ノート1", "内容");
    const paths = getVaultPaths(TEST_VAULT);

    await incrementalIndex(paths);

    // 新しいファイルを追加
    writeNote("note2.md", "ノート2", "新しいノート");

    const result = await incrementalIndex(paths);
    expect(result.indexedNotes).toBe(1); // note2だけ
    expect(result.skippedNotes).toBe(1); // note1はスキップ
    expect(getIndexCount(paths.indexDb)).toBe(2);
  });

  test("削除されたファイルがインデックスから除去される", async () => {
    writeNote("note1.md", "ノート1", "内容");
    writeNote("note2.md", "ノート2", "内容");
    const paths = getVaultPaths(TEST_VAULT);

    await incrementalIndex(paths);
    expect(getIndexCount(paths.indexDb)).toBe(2);

    // note2を削除
    rmSync(path.join(TEST_VAULT, "note2.md"));

    const result = await incrementalIndex(paths);
    expect(result.deletedNotes).toBe(1);
    expect(result.skippedNotes).toBe(1);
    expect(getIndexCount(paths.indexDb)).toBe(1);
  });

  test("rebuildIndex(--force)は全件再構築する", async () => {
    writeNote("note1.md", "ノート1", "内容");
    const paths = getVaultPaths(TEST_VAULT);

    await incrementalIndex(paths);

    // forceリビルド
    const result = await rebuildIndex(paths);
    expect(result.indexedNotes).toBe(1);
    expect(result.skippedNotes).toBe(0);
    expect(getIndexCount(paths.indexDb)).toBe(1);
  });
});

describe("マイグレーション", () => {
  beforeEach(() => {
    if (existsSync(TEST_VAULT)) rmSync(TEST_VAULT, { recursive: true });
    mkdirSync(TEST_VAULT, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_VAULT)) rmSync(TEST_VAULT, { recursive: true });
  });

  test("古いスキーマ（v1）のDBがマイグレーションされる", async () => {
    // v1スキーマのDBを手動作成（file_mtimeカラムなし）
    const kuraDir = path.join(TEST_VAULT, ".kura");
    mkdirSync(kuraDir, { recursive: true });
    const dbPath = path.join(kuraDir, "index.db");

    const db = new Database(dbPath);
    db.run("PRAGMA journal_mode = WAL");
    db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      file_path, title, content_original, content_tokenized, tokenize='unicode61'
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS notes_meta (
      file_path TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      confidential INTEGER NOT NULL DEFAULT 0,
      security_flag TEXT NOT NULL DEFAULT 'clean'
    )`);
    db.close();

    // ノートを作成してインデックス → マイグレーションが走るはず
    writeNote("note1.md", "ノート1", "内容");
    const paths = getVaultPaths(TEST_VAULT);
    const result = await incrementalIndex(paths);

    expect(result.indexedNotes).toBe(1);

    // file_mtimeカラムが追加されていることを確認
    const db2 = new Database(dbPath, { readonly: true });
    const columns = db2.query("PRAGMA table_info(notes_meta)").all() as Array<{ name: string }>;
    db2.close();
    expect(columns.some((c) => c.name === "file_mtime")).toBe(true);
  });
});
