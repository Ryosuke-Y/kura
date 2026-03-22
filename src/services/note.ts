/**
 * ノートCRUDサービス
 *
 * Markdownファイルの作成・読み込み・一覧取得を担当。
 * ファイルシステム上のMarkdownファイルが唯一の真のデータソースであり、
 * SQLiteインデックスはいつでも再構築可能な二次データ。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import path from "path";
import type { Note, Frontmatter } from "../models/note.ts";
import {
  parseFrontmatter,
  serializeFrontmatter,
} from "../utils/frontmatter.ts";
import { createDefaultFrontmatter } from "../models/note.ts";

/**
 * ノートを新規作成する
 *
 * @param vaultRoot - Vaultのルートディレクトリ
 * @param title - ノートのタイトル
 * @param dir - 保存先サブディレクトリ（例: "inbox", "projects"）
 * @returns 作成したファイルのVaultルートからの相対パス
 */
export function createNote(
  vaultRoot: string,
  title: string,
  dir: string = ""
): string {
  // ファイル名をタイトルから生成（安全な文字のみ）
  const safeTitle = title
    .replace(/[/\\:*?"<>|]/g, "-") // ファイルシステムで使えない文字を置換
    .replace(/\s+/g, "-") // スペースをハイフンに
    .slice(0, 100); // 長すぎるタイトルを切り詰め

  const targetDir = dir ? path.join(vaultRoot, dir) : vaultRoot;
  const filePath = path.join(targetDir, `${safeTitle}.md`);

  if (existsSync(filePath)) {
    throw new Error(`ノートが既に存在します: ${filePath}`);
  }

  // ディレクトリがなければ作成
  const dirPath = path.dirname(filePath);
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }

  const frontmatter = createDefaultFrontmatter(title);
  const content = serializeFrontmatter(frontmatter, "\n");

  writeFileSync(filePath, content, "utf-8");

  // Vaultルートからの相対パスを返す
  return path.relative(vaultRoot, filePath);
}

/** ファイルパスからノートを読み込む */
export function readNote(vaultRoot: string, relativePath: string): Note {
  const filePath = path.join(vaultRoot, relativePath);

  if (!existsSync(filePath)) {
    throw new Error(`ノートが見つかりません: ${filePath}`);
  }

  const rawContent = readFileSync(filePath, "utf-8");
  const { frontmatter, content } = parseFrontmatter(rawContent);

  return {
    frontmatter,
    content,
    rawContent,
    filePath: relativePath,
  };
}

/** ノートの内容を更新する（frontmatterのupdatedも更新） */
export function updateNote(
  vaultRoot: string,
  relativePath: string,
  newContent: string,
  frontmatterUpdates?: Partial<Frontmatter>
): Note {
  const existing = readNote(vaultRoot, relativePath);
  const now = new Date().toISOString();

  // immutableに新しいfrontmatterを作成（CLAUDE.mdのイミュータビリティ規約）
  const updatedFrontmatter: Frontmatter = {
    ...existing.frontmatter,
    ...frontmatterUpdates,
    updated: now,
  };

  const rawContent = serializeFrontmatter(updatedFrontmatter, newContent);
  const filePath = path.join(vaultRoot, relativePath);
  writeFileSync(filePath, rawContent, "utf-8");

  return {
    frontmatter: updatedFrontmatter,
    content: newContent,
    rawContent,
    filePath: relativePath,
  };
}

/**
 * Vault内の全Markdownファイルを再帰的に列挙する
 *
 * .kura/ ディレクトリは除外する（インデックス等のシステムファイル）。
 */
export function listNotes(vaultRoot: string, subDir?: string): string[] {
  const searchDir = subDir
    ? path.join(vaultRoot, subDir)
    : vaultRoot;

  if (!existsSync(searchDir)) {
    return [];
  }

  const results: string[] = [];

  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // .kura/, .git/, node_modules/ は除外
      if (
        entry.isDirectory() &&
        !entry.name.startsWith(".") &&
        entry.name !== "node_modules"
      ) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push(path.relative(vaultRoot, fullPath));
      }
    }
  }

  walk(searchDir);

  // 更新日時の新しい順にソート
  results.sort((a, b) => {
    const statA = statSync(path.join(vaultRoot, a));
    const statB = statSync(path.join(vaultRoot, b));
    return statB.mtimeMs - statA.mtimeMs;
  });

  return results;
}
