/**
 * FTS5インデックス構築サービス
 *
 * Vault内の全Markdownファイルを読み込み、kuromojiで分かち書きして
 * FTS5インデックスに登録する。
 *
 * インデックスは .kura/index.db に格納され、いつでも再構築可能。
 * incrementalIndex: ファイルのmtimeを比較し、変更があったファイルのみ更新。
 * rebuildIndex: 全件削除→全件再登録（--force時に使用）。
 */

import { Database } from "bun:sqlite";
import { statSync } from "fs";
import path from "path";
import type { VaultPaths } from "./vault.ts";
import { migrateIndexDb } from "./vault.ts";
import { listNotes, readNote } from "./note.ts";
import { tokenize } from "./tokenizer.ts";

/** インデックスDBを開く（エラーラップ付き） */
function openIndexDb(dbPath: string): Database {
  try {
    const db = new Database(dbPath);
    db.run("PRAGMA journal_mode = WAL");
    return db;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `インデックスDBを開けません: ${dbPath}\n原因: ${msg}\nヒント: \`kura init\` でVaultを再初期化するか、.kura/index.db を削除して \`kura index --force\` を実行してください。`
    );
  }
}

/**
 * トークナイズ対象の本文サイズ上限（文字数）
 *
 * kuromojiの形態素解析は入力サイズに比例してCPU時間を消費する。
 * 16MBのClippingファイルなどでインデックス構築が事実上停止するため、
 * 先頭50,000文字でカットする。
 * - 50,000文字 ≈ 日本語で約25,000語相当。論文の概要・本文は十分カバー
 * - 超過分はcontent_originalには全文保存されるため、表示には影響なし
 */
const MAX_CONTENT_CHARS = 50_000;

/** インデックス構築の結果 */
export interface IndexResult {
  readonly totalNotes: number;
  readonly indexedNotes: number;
  readonly skippedNotes: number; // 差分更新でスキップされた件数
  readonly deletedNotes: number; // 削除されたファイル分の件数
  readonly errors: readonly string[];
  readonly elapsedMs: number;
}

/**
 * Vault全体のインデックスを再構築する
 *
 * 既存のインデックスを全削除してから全ノートを再登録する。
 * 差分更新は将来の最適化として実装予定。
 */
export async function rebuildIndex(paths: VaultPaths): Promise<IndexResult> {
  const start = performance.now();
  const errors: string[] = [];

  // マイグレーション（file_mtimeカラムがない古いDBへの対応）
  migrateIndexDb(paths.indexDb);

  const db = openIndexDb(paths.indexDb);

  // 既存データをクリア
  db.run("DELETE FROM notes_fts");
  db.run("DELETE FROM notes_meta");

  // 全Markdownファイルを列挙
  const noteFiles = listNotes(paths.root);

  const insertFts = db.prepare(
    "INSERT INTO notes_fts (file_path, title, content_original, content_tokenized) VALUES (?, ?, ?, ?)"
  );
  const insertMeta = db.prepare(`
    INSERT INTO notes_meta (file_path, title, tags, created, updated, confidential, security_flag, file_mtime)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let indexedCount = 0;

  for (const filePath of noteFiles) {
    try {
      const fullPath = path.join(paths.root, filePath);
      const mtime = statSync(fullPath).mtime.toISOString();
      const note = readNote(paths.root, filePath);
      const fm = note.frontmatter;

      const created = fm.created || mtime;
      const updated = fm.updated || mtime;

      // 巨大ファイル対策: 本文はMAX_CONTENT_CHARSまでをトークナイズ対象にする
      const contentForTokenize = note.content.length > MAX_CONTENT_CHARS
        ? note.content.slice(0, MAX_CONTENT_CHARS)
        : note.content;
      const tokenizedTitle = await tokenize(fm.title || filePath);
      const tokenizedContent = await tokenize(contentForTokenize);
      const tokenizedAll = `${tokenizedTitle} ${tokenizedContent}`;

      insertFts.run(filePath, fm.title, note.content, tokenizedAll);
      insertMeta.run(
        filePath, fm.title, JSON.stringify(fm.tags),
        created, updated,
        fm.confidential ? 1 : 0, fm.security_flag, mtime
      );

      indexedCount++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${filePath}: ${message}`);
    }
  }

  db.close();

  return {
    totalNotes: noteFiles.length,
    indexedNotes: indexedCount,
    skippedNotes: 0,
    deletedNotes: 0,
    errors,
    elapsedMs: performance.now() - start,
  };
}

/**
 * 差分インデックス更新
 *
 * ファイルのmtimeを比較し、変更があったファイルのみ再登録する。
 * - 新規ファイル → INSERT
 * - mtime変更 → DELETE + INSERT
 * - 削除されたファイル → DELETE
 * - 変更なし → スキップ
 */
export async function incrementalIndex(paths: VaultPaths): Promise<IndexResult> {
  const start = performance.now();
  const errors: string[] = [];

  // マイグレーション
  migrateIndexDb(paths.indexDb);

  const db = openIndexDb(paths.indexDb);

  // 現在のインデックス内ファイル一覧とmtimeを取得
  const indexedFiles = new Map<string, string>();
  const rows = db.query("SELECT file_path, file_mtime FROM notes_meta").all() as Array<{
    file_path: string;
    file_mtime: string;
  }>;
  for (const row of rows) {
    indexedFiles.set(row.file_path, row.file_mtime);
  }

  // 現在のVault内ファイル一覧
  const currentFiles = new Set(listNotes(paths.root));

  // 削除されたファイルを検出・削除
  let deletedCount = 0;
  const deleteFts = db.prepare("DELETE FROM notes_fts WHERE file_path = ?");
  const deleteMeta = db.prepare("DELETE FROM notes_meta WHERE file_path = ?");

  for (const [filePath] of indexedFiles) {
    if (!currentFiles.has(filePath)) {
      deleteFts.run(filePath);
      deleteMeta.run(filePath);
      deletedCount++;
    }
  }

  // 新規・更新ファイルを処理
  const insertFts = db.prepare(
    "INSERT INTO notes_fts (file_path, title, content_original, content_tokenized) VALUES (?, ?, ?, ?)"
  );
  const insertMeta = db.prepare(`
    INSERT INTO notes_meta (file_path, title, tags, created, updated, confidential, security_flag, file_mtime)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let indexedCount = 0;
  let skippedCount = 0;

  for (const filePath of currentFiles) {
    try {
      const fullPath = path.join(paths.root, filePath);
      const mtime = statSync(fullPath).mtime.toISOString();

      // mtimeが同じならスキップ
      const storedMtime = indexedFiles.get(filePath);
      if (storedMtime === mtime) {
        skippedCount++;
        continue;
      }

      // 既存エントリがあれば削除（更新の場合）
      if (indexedFiles.has(filePath)) {
        deleteFts.run(filePath);
        deleteMeta.run(filePath);
      }

      const note = readNote(paths.root, filePath);
      const fm = note.frontmatter;

      const created = fm.created || mtime;
      const updated = fm.updated || mtime;

      const contentForTokenize = note.content.length > MAX_CONTENT_CHARS
        ? note.content.slice(0, MAX_CONTENT_CHARS)
        : note.content;
      const tokenizedTitle = await tokenize(fm.title || filePath);
      const tokenizedContent = await tokenize(contentForTokenize);
      const tokenizedAll = `${tokenizedTitle} ${tokenizedContent}`;

      insertFts.run(filePath, fm.title, note.content, tokenizedAll);
      insertMeta.run(
        filePath, fm.title, JSON.stringify(fm.tags),
        created, updated,
        fm.confidential ? 1 : 0, fm.security_flag, mtime
      );

      indexedCount++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${filePath}: ${message}`);
    }
  }

  db.close();

  return {
    totalNotes: currentFiles.size,
    indexedNotes: indexedCount,
    skippedNotes: skippedCount,
    deletedNotes: deletedCount,
    errors,
    elapsedMs: performance.now() - start,
  };
}
