/**
 * デイリーノートサービス
 *
 * 日付ベースのデイリーノートを daily/ ディレクトリに作成・管理する。
 * 既にその日のノートが存在すれば作成せずパスを返す（冪等）。
 *
 * 将来的にconfig.tomlのテンプレート設定やテンプレートファイル対応を
 * このサービスに追加する想定。
 */

import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { serializeFrontmatter } from "../utils/frontmatter.ts";
import { listNotes } from "./note.ts";
import type { Frontmatter } from "../models/note.ts";

/** デイリーノートのデフォルト保存先 */
const DAILY_DIR = "daily";

/** デイリーノート作成結果 */
export interface DailyNoteResult {
  readonly filePath: string; // Vaultルートからの相対パス
  readonly created: boolean; // 今回新規作成したか（falseなら既存）
}

/**
 * 日付文字列をバリデーションする
 *
 * YYYY-MM-DD 形式かつ有効な日付かを確認。
 */
export function isValidDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  // JSのDateは存在しない日付（2/30等）を翌月に繰り上げるため、
  // パース後に年月日が一致するか確認する
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year!, month! - 1, day!);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month! - 1 &&
    date.getDate() === day
  );
}

/**
 * 今日の日付を YYYY-MM-DD 形式で返す
 */
export function todayDateStr(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * デイリーノートのデフォルトテンプレートを生成する
 *
 * シンプルなセクション構成。将来的にはテンプレートファイルから読み込む。
 */
function generateDefaultContent(dateStr: string): string {
  return `\n## やること\n\n- \n\n## メモ\n\n\n## ふりかえり\n\n`;
}

/**
 * デイリーノートを作成する（冪等）
 *
 * 指定日のデイリーノートが存在しなければ作成し、パスを返す。
 * 既に存在すればそのパスを返す（上書きしない）。
 */
export function createDailyNote(
  vaultRoot: string,
  dateStr?: string
): DailyNoteResult {
  const date = dateStr ?? todayDateStr();

  if (!isValidDate(date)) {
    throw new Error(`無効な日付形式です: ${date}（YYYY-MM-DD形式で指定してください）`);
  }

  const relativePath = path.join(DAILY_DIR, `${date}.md`);
  const absolutePath = path.join(vaultRoot, relativePath);

  // 既に存在すれば作成しない（冪等）
  if (existsSync(absolutePath)) {
    return { filePath: relativePath, created: false };
  }

  // daily/ ディレクトリがなければ作成
  const dailyDir = path.join(vaultRoot, DAILY_DIR);
  if (!existsSync(dailyDir)) {
    mkdirSync(dailyDir, { recursive: true });
  }

  // frontmatter + デフォルトテンプレート
  const now = new Date().toISOString();
  const frontmatter: Frontmatter = {
    title: date,
    tags: ["daily"],
    created: now,
    updated: now,
    confidential: false,
    security_flag: "clean",
  };
  const content = generateDefaultContent(date);
  const fileContent = serializeFrontmatter(frontmatter, content);

  writeFileSync(absolutePath, fileContent, "utf-8");

  return { filePath: relativePath, created: true };
}

/**
 * デイリーノートの一覧を返す
 *
 * daily/ ディレクトリ内のMarkdownファイルを新しい順に返す。
 */
export function listDailyNotes(vaultRoot: string): readonly string[] {
  return listNotes(vaultRoot, DAILY_DIR);
}
