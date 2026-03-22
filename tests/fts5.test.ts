/**
 * FTS5基本動作テスト
 *
 * bun:sqliteでFTS5が正しく動作することを検証する。
 * 日本語トークナイザーは関係なく、FTS5エンジン自体の動作確認。
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";

describe("FTS5基本動作", () => {
  let db: Database;

  beforeAll(() => {
    db = new Database(":memory:");
    db.run(`
      CREATE VIRTUAL TABLE test_fts USING fts5(
        title,
        content,
        tokenize='unicode61'
      )
    `);

    // テストデータ挿入
    const stmt = db.prepare(
      "INSERT INTO test_fts (title, content) VALUES (?, ?)"
    );
    stmt.run("TypeScript Guide", "TypeScript is a typed superset of JavaScript");
    stmt.run("SQLite FTS5", "FTS5 provides full-text search functionality for SQLite");
    stmt.run("Bun Runtime", "Bun is a fast JavaScript runtime with built-in SQLite support");
    stmt.run("Knowledge Management", "A tool for organizing and searching information efficiently");
  });

  afterAll(() => {
    db.close();
  });

  test("FTS5仮想テーブルを作成できる", () => {
    // テーブルが存在することを確認
    const result = db
      .query("SELECT count(*) as cnt FROM test_fts")
      .get() as { cnt: number };
    expect(result.cnt).toBe(4);
  });

  test("MATCHで単語検索できる", () => {
    const results = db
      .query("SELECT title FROM test_fts WHERE test_fts MATCH ?")
      .all("TypeScript") as Array<{ title: string }>;

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.title === "TypeScript Guide")).toBe(true);
  });

  test("AND検索（スペース区切り）が動作する", () => {
    const results = db
      .query("SELECT title FROM test_fts WHERE test_fts MATCH ?")
      .all("JavaScript runtime") as Array<{ title: string }>;

    expect(results.length).toBe(1);
    expect(results[0]!.title).toBe("Bun Runtime");
  });

  test("OR検索が動作する", () => {
    const results = db
      .query("SELECT title FROM test_fts WHERE test_fts MATCH ?")
      .all("TypeScript OR Bun") as Array<{ title: string }>;

    expect(results.length).toBe(2);
  });

  test("snippet()関数が動作する", () => {
    const results = db
      .query(
        "SELECT snippet(test_fts, 1, '【', '】', '...', 10) as snip FROM test_fts WHERE test_fts MATCH ?"
      )
      .all("search") as Array<{ snip: string }>;

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.snip).toContain("【search】");
  });

  test("bm25()関数がスコアを返す", () => {
    const results = db
      .query(
        "SELECT title, bm25(test_fts) as score FROM test_fts WHERE test_fts MATCH ? ORDER BY bm25(test_fts)"
      )
      .all("SQLite") as Array<{ title: string; score: number }>;

    expect(results.length).toBeGreaterThan(0);
    // BM25スコアは負の数（小さいほど関連度が高い）
    expect(results[0]!.score).toBeLessThan(0);
  });

  test("ヒットしないクエリは空配列を返す", () => {
    const results = db
      .query("SELECT title FROM test_fts WHERE test_fts MATCH ?")
      .all("blockchain");

    expect(results.length).toBe(0);
  });
});
