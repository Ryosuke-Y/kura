/**
 * Vault管理サービス
 *
 * Vault = Kuraが管理するノートのルートディレクトリ。
 * `.kura/` サブディレクトリにインデックスDB・設定ファイルを格納する。
 *
 * ディレクトリ構造:
 * ~/knowledge/        ← Vault ルート
 * ├── .kura/
 * │   ├── config.toml ← 設定
 * │   └── index.db    ← FTS5インデックス
 * ├── daily/
 * ├── projects/
 * └── inbox/
 */

import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { Database } from "bun:sqlite";

/** Vault内の重要パス */
export interface VaultPaths {
  readonly root: string; // Vaultルートディレクトリ
  readonly kuraDir: string; // .kura/ ディレクトリ
  readonly indexDb: string; // .kura/index.db
  readonly configFile: string; // .kura/config.toml
}

/** Vaultのパスを組み立てる */
export function getVaultPaths(vaultRoot: string): VaultPaths {
  const kuraDir = path.join(vaultRoot, ".kura");
  return {
    root: vaultRoot,
    kuraDir,
    indexDb: path.join(kuraDir, "index.db"),
    configFile: path.join(kuraDir, "config.toml"),
  };
}

/** 指定ディレクトリがKura Vaultかどうか判定 */
export function isVault(dir: string): boolean {
  return existsSync(path.join(dir, ".kura"));
}

/**
 * 現在のディレクトリからVaultルートを探す
 *
 * カレントディレクトリから親方向に .kura/ を探索する。
 * git が .git/ を探すのと同じパターン。
 */
export function findVaultRoot(startDir: string): string | null {
  let current = path.resolve(startDir);

  while (true) {
    if (isVault(current)) {
      return current;
    }

    const parent = path.dirname(current);
    // ルートディレクトリに到達したら終了
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

/** Vaultを新規作成する */
export function initVault(vaultRoot: string): VaultPaths {
  const paths = getVaultPaths(vaultRoot);

  if (isVault(vaultRoot)) {
    throw new Error(`既にVaultが存在します: ${vaultRoot}`);
  }

  // .kura/ ディレクトリ作成
  mkdirSync(paths.kuraDir, { recursive: true });

  // FTS5インデックスDBを初期化
  initIndexDb(paths.indexDb);

  // デフォルト設定ファイルを作成
  const defaultConfig = `[vault]
name = "main"
language = "en"  # "en" | "ja" | "zh"

[search]
decay_rate = 0.01  # Higher = older notes rank lower

[serve]
port = 3847
open_browser = true
`;
  writeFileSync(paths.configFile, defaultConfig, "utf-8");

  return paths;
}

/**
 * 現在のDBスキーマバージョン
 *
 * バージョン履歴:
 *   1 — 初期スキーマ（notes_fts + notes_meta）
 *   2 — notes_metaにfile_mtimeカラム追加（差分インデックス用）
 */
const CURRENT_SCHEMA_VERSION = 2;

/** FTS5インデックスDBを初期化する（新規作成時） */
function initIndexDb(dbPath: string): void {
  const db = new Database(dbPath);

  db.run("PRAGMA journal_mode = WAL");

  // スキーマバージョン管理テーブル
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL
    )
  `);
  db.run(`INSERT INTO schema_version (version) VALUES (${CURRENT_SCHEMA_VERSION})`);

  // ノートの全文検索インデックス
  db.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      file_path,
      title,
      content_original,
      content_tokenized,
      tokenize='unicode61'
    )
  `);

  // ノートのメタデータテーブル
  // file_mtime: インデックス時のファイルmtime（差分更新の比較用）
  db.run(`
    CREATE TABLE IF NOT EXISTS notes_meta (
      file_path TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      confidential INTEGER NOT NULL DEFAULT 0,
      security_flag TEXT NOT NULL DEFAULT 'clean',
      file_mtime TEXT NOT NULL DEFAULT ''
    )
  `);

  db.close();
}

/**
 * 既存DBのスキーマをマイグレーションする
 *
 * 古いバージョンのDBを検出し、必要なALTER TABLEを実行する。
 * 新しいDBには影響しない（CREATE IF NOT EXISTS）。
 */
export function migrateIndexDb(dbPath: string): void {
  const db = new Database(dbPath);
  db.run("PRAGMA journal_mode = WAL");

  // schema_versionテーブルがなければバージョン1（初期スキーマ）
  const hasVersionTable = db
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
    .get();

  let currentVersion = 0;
  if (hasVersionTable) {
    const row = db.query("SELECT version FROM schema_version LIMIT 1").get() as
      | { version: number }
      | null;
    currentVersion = row?.version ?? 0;
  }

  if (currentVersion < CURRENT_SCHEMA_VERSION) {
    // v1 → v2: file_mtimeカラム追加
    if (currentVersion < 2) {
      // カラムが既に存在するかチェック（ALTER TABLEは冪等でないため）
      const columns = db.query("PRAGMA table_info(notes_meta)").all() as Array<{ name: string }>;
      if (!columns.some((c) => c.name === "file_mtime")) {
        db.run("ALTER TABLE notes_meta ADD COLUMN file_mtime TEXT NOT NULL DEFAULT ''");
      }
    }

    // バージョン更新
    if (!hasVersionTable) {
      db.run("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
      db.run(`INSERT INTO schema_version (version) VALUES (${CURRENT_SCHEMA_VERSION})`);
    } else {
      db.run(`UPDATE schema_version SET version = ${CURRENT_SCHEMA_VERSION}`);
    }
  }

  db.close();
}
