/**
 * 検索サービス
 *
 * FTS5インデックスに対して全文検索を実行する。
 * 検索クエリはkuromojiで分かち書きしてからMATCHに渡す。
 */

import { Database } from "bun:sqlite";
import type { VaultPaths } from "./vault.ts";
import { tokenize } from "./tokenizer.ts";

/** 検索結果1件の型 */
export interface SearchResult {
  readonly filePath: string;
  readonly title: string;
  readonly snippet: string; // 本文のスニペット（検索語ハイライト付き）
  readonly score: number; // 時間減衰適用後のスコア（小さいほど関連度が高い）
  readonly updated: string; // ノートの最終更新日時（ISO 8601）
  readonly securityFlag: "clean" | "suspicious"; // セキュリティスキャン結果
}

/** 検索メタデータ（検索結果に付随する統計情報） */
export interface SearchMeta {
  readonly excludedConfidential: number; // confidentialフィルタで除外された件数
}

/**
 * 時間減衰のデフォルト値
 *
 * 逆比例型: freshness_boost = 1.0 / (1.0 + decayRate * days)
 * - 0.01: 30日で約0.77、90日で約0.53、365日で約0.21
 * - config.toml の [search] decay_rate で変更可能
 */
const DEFAULT_DECAY_RATE = 0.01;

/**
 * 日本語全文検索を実行する
 *
 * @param paths - Vaultのパス情報
 * @param query - 検索クエリ（自然な日本語でOK）
 * @param limit - 最大結果件数
 * @param decayRate - 時間減衰率（config.tomlから渡す。省略時はデフォルト0.01）
 * @returns 検索結果の配列 + メタデータ（除外件数など）
 */
export async function searchNotes(
  paths: VaultPaths,
  query: string,
  limit: number = 10,
  decayRate: number = DEFAULT_DECAY_RATE
): Promise<{ readonly results: readonly SearchResult[]; readonly meta: SearchMeta }> {
  // クエリを分かち書き
  const tokenizedQuery = await tokenize(query);

  if (tokenizedQuery.trim() === "") {
    return { results: [], meta: { excludedConfidential: 0 } };
  }

  let db: Database;
  try {
    db = new Database(paths.indexDb, { readonly: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `インデックスDBを開けません。\`kura index --force\` で再構築してください。\n原因: ${msg}`
    );
  }

  try {
    // notes_fts（BM25スコア）と notes_meta（updated日時）をJOINし、
    // BM25スコアに時間減衰ブーストを掛けてランキングする。
    //
    // BM25スコアは負値（小さいほど関連度が高い）なので、
    // freshness_boost（0〜1）を掛けると：
    //   新しいノート → ブースト大 → スコアがより負に → 上位
    //   古いノート → ブースト小 → スコアが0に近づく → 下位
    // 注意: BunのSQLiteではFTS5のMATCHに名前付きパラメータが使えない
    // （空文字列として解釈されてしまう）ため、全て位置パラメータを使う
    // confidentialフィルタで除外される件数を取得
    const confidentialCount = db
      .query(
        `
      SELECT COUNT(*) as count
      FROM notes_fts f
      JOIN notes_meta m ON f.file_path = m.file_path
      WHERE f.content_tokenized MATCH ? AND m.confidential = 1
    `
      )
      .get(tokenizedQuery) as { count: number };

    const results = db
      .query(
        `
      SELECT
        f.file_path,
        f.title,
        snippet(notes_fts, 2, '【', '】', '...', 30) as snippet,
        bm25(notes_fts, 0, 0, 0, 1)
          * (1.0 / (1.0 + ? * (julianday('now') - julianday(m.updated))))
          as score,
        m.updated,
        m.security_flag
      FROM notes_fts f
      JOIN notes_meta m ON f.file_path = m.file_path
      WHERE f.content_tokenized MATCH ?
        AND m.confidential = 0
      ORDER BY score
      LIMIT ?
    `
      )
      .all(decayRate, tokenizedQuery, limit) as Array<{
      file_path: string;
      title: string;
      snippet: string;
      score: number;
      updated: string;
      security_flag: string;
    }>;

    return {
      results: results.map((r) => ({
        filePath: r.file_path,
        title: r.title,
        snippet: r.snippet,
        score: r.score,
        updated: r.updated,
        securityFlag: r.security_flag === "suspicious" ? "suspicious" as const : "clean" as const,
      })),
      meta: {
        excludedConfidential: confidentialCount.count,
      },
    };
  } finally {
    db.close();
  }
}
