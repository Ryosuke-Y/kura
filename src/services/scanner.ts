/**
 * セキュリティスキャンサービス
 *
 * Vault内のノートをスキャンし、プロンプトインジェクションや
 * ドキュメントポイズニングの兆候を検知する。
 *
 * sanitizer.tsの検知関数を再利用し、ノート単位でスキャン結果を返す。
 * 検知時はnotes_metaのsecurity_flagを更新する。
 */

import { Database } from "bun:sqlite";
import type { VaultPaths } from "./vault.ts";
import { listNotes, readNote } from "./note.ts";
import {
  removeHtmlComments,
  removeZeroWidthChars,
  detectInjectionPatterns,
} from "./sanitizer.ts";

/** 1件のノートのスキャン結果 */
export interface ScanFinding {
  readonly filePath: string;
  readonly title: string;
  readonly warnings: readonly string[];
}

/** Vault全体のスキャン結果 */
export interface ScanResult {
  readonly totalNotes: number;
  readonly scannedNotes: number;
  readonly suspiciousNotes: number;
  readonly findings: readonly ScanFinding[];
  readonly errors: readonly string[];
  readonly elapsedMs: number;
}

/**
 * 1件のノートをスキャンする
 *
 * 3つの検知を実行し、1つでも警告があればfindingとして返す。
 */
function scanNote(content: string): readonly string[] {
  const warnings: string[] = [];

  const htmlResult = removeHtmlComments(content);
  warnings.push(...htmlResult.warnings);

  const zeroWidthResult = removeZeroWidthChars(content);
  warnings.push(...zeroWidthResult.warnings);

  const injectionResult = detectInjectionPatterns(content);
  warnings.push(...injectionResult.warnings);

  return warnings;
}

/**
 * Vault全体をスキャンする
 *
 * 全ノートを読み込み、各ノートに対してセキュリティスキャンを実行。
 * 検知があったノートのnotes_metaを 'suspicious' に更新する。
 */
export function auditVault(paths: VaultPaths): ScanResult {
  const start = performance.now();
  const errors: string[] = [];
  const findings: ScanFinding[] = [];

  const noteFiles = listNotes(paths.root);
  let scannedCount = 0;

  let db: Database;
  try {
    db = new Database(paths.indexDb);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `インデックスDBを開けません。先に \`kura index\` を実行してください。\n原因: ${msg}`
    );
  }

  // security_flagの更新用prepared statement
  const updateFlag = db.prepare(
    "UPDATE notes_meta SET security_flag = ? WHERE file_path = ?"
  );

  // スキャン前に全ノートをcleanにリセット
  // （前回suspiciousだったが修正されたノートを正しく扱うため）
  db.run("UPDATE notes_meta SET security_flag = 'clean'");

  for (const filePath of noteFiles) {
    try {
      const note = readNote(paths.root, filePath);
      const title = note.frontmatter.title || filePath;

      // 本文とfrontmatter全体をスキャン対象にする
      const warnings = scanNote(note.rawContent);

      if (warnings.length > 0) {
        findings.push({ filePath, title, warnings });
        updateFlag.run("suspicious", filePath);
      }

      scannedCount++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${filePath}: ${message}`);
    }
  }

  db.close();

  return {
    totalNotes: noteFiles.length,
    scannedNotes: scannedCount,
    suspiciousNotes: findings.length,
    findings,
    errors,
    elapsedMs: performance.now() - start,
  };
}
