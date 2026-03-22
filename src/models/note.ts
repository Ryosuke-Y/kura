/**
 * ノートのデータモデル
 *
 * Kuraのノートは「YAML frontmatter + Markdown本文」の構成。
 * frontmatterにメタデータ（タイトル、タグ、日時など）を格納し、
 * 本文はプレーンMarkdownで特殊記法なし。
 */

/** frontmatterの型定義 */
export interface Frontmatter {
  readonly title: string;
  readonly tags: readonly string[];
  readonly created: string; // ISO-8601 datetime
  readonly updated: string; // ISO-8601 datetime
  readonly confidential: boolean;
  readonly security_flag: "clean" | "suspicious";
}

/** frontmatterのデフォルト値を生成 */
export function createDefaultFrontmatter(
  title: string,
  now?: string
): Frontmatter {
  const timestamp = now ?? new Date().toISOString();
  return {
    title,
    tags: [],
    created: timestamp,
    updated: timestamp,
    confidential: false,
    security_flag: "clean",
  };
}

/** パース済みノート全体の型 */
export interface Note {
  readonly frontmatter: Frontmatter;
  readonly content: string; // Markdown本文（frontmatter除く）
  readonly rawContent: string; // ファイル全体のテキスト
  readonly filePath: string; // Vaultルートからの相対パス
}

/** FTS5インデックスに登録するためのデータ */
export interface IndexEntry {
  readonly filePath: string;
  readonly title: string;
  readonly contentOriginal: string;
  readonly contentTokenized: string;
  readonly updated: string;
}
