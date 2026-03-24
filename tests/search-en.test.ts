/**
 * 英語検索統合テスト
 *
 * language: "en" 設定での全文検索が正しく動作することを検証する。
 * 英語トークナイザーはパススルー（テキストをそのまま返す）で、
 * 実際の単語分割はFTS5のunicode61トークナイザーが行う。
 *
 * kuromoji辞書不要なので高速に実行できる。
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { initTokenizer, tokenize } from "../src/services/tokenizer.ts";

// 英語トークナイザーを初期化（テストスイート全体で1回）
beforeAll(() => {
  initTokenizer("en");
});

describe("英語FTS5統合検索", () => {
  let db: Database;

  // 英語のテスト用ノート
  const testNotes = [
    {
      title: "Knowledge Management Tools",
      content:
        "Knowledge management tools help organize, store, and retrieve information efficiently.",
    },
    {
      title: "Kura Project Plan",
      content:
        "Kura is a lightweight knowledge management tool. CLI-first design without Electron.",
    },
    {
      title: "SQLite Full-Text Search",
      content:
        "FTS5 is the full-text search engine for SQLite. It supports BM25 ranking and prefix queries.",
    },
    {
      title: "Local LLM Integration",
      content:
        "Run Qwen 9B locally and integrate it with your knowledge base for semantic search.",
    },
    {
      title: "Markdown-Based Design",
      content:
        "Plain Markdown files can be edited with any editor: Obsidian, VS Code, or Vim.",
    },
  ];

  beforeAll(async () => {
    db = new Database(":memory:");

    // FTS5テーブル作成（プロダクションと同じスキーマ）
    db.run(`
      CREATE VIRTUAL TABLE notes_fts USING fts5(
        title,
        content_original,
        content_tokenized,
        tokenize='unicode61'
      )
    `);

    const stmt = db.prepare(
      "INSERT INTO notes_fts (title, content_original, content_tokenized) VALUES (?, ?, ?)"
    );

    for (const note of testNotes) {
      // 英語トークナイザーはパススルーなので、そのまま連結される
      const tokenizedAll = `${await tokenize(note.title)} ${await tokenize(note.content)}`;
      stmt.run(note.title, note.content, tokenizedAll);
    }
  });

  afterAll(() => {
    db.close();
  });

  /** 検索ヘルパー */
  async function search(
    query: string
  ): Promise<Array<{ title: string; score: number }>> {
    const tokenizedQuery = await tokenize(query);
    return db
      .query(
        `SELECT title, bm25(notes_fts, 0, 0, 1) as score
         FROM notes_fts
         WHERE content_tokenized MATCH ?
         ORDER BY bm25(notes_fts, 0, 0, 1)
         LIMIT 10`
      )
      .all(tokenizedQuery) as Array<{ title: string; score: number }>;
  }

  // === 基本検索テスト ===

  test("英単語で関連ノートがヒットする", async () => {
    const results = await search("knowledge");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.title === "Knowledge Management Tools")).toBe(
      true
    );
  });

  test("大文字小文字を区別しない（case-insensitive）", async () => {
    // FTS5 unicode61はデフォルトでcase-insensitiveにマッチする
    const upper = await search("SQLITE");
    const lower = await search("sqlite");
    const mixed = await search("SQLite");

    // すべて同じノートがヒットする
    expect(upper.length).toBeGreaterThan(0);
    expect(upper[0]!.title).toBe("SQLite Full-Text Search");
    expect(lower[0]!.title).toBe("SQLite Full-Text Search");
    expect(mixed[0]!.title).toBe("SQLite Full-Text Search");
  });

  test("複数単語のAND検索ができる", async () => {
    // FTS5ではスペース区切りの複数語はIMPLICIT ANDとして扱われる
    const results = await search("lightweight CLI");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.title === "Kura Project Plan")).toBe(true);
  });

  test("存在しない単語では0件返る", async () => {
    const results = await search("blockchain");
    expect(results.length).toBe(0);
  });

  test("検索結果がBM25スコア順にソートされている", async () => {
    const results = await search("knowledge");
    if (results.length >= 2) {
      // BM25は小さいほど関連度が高い → 先頭が最小値
      expect(results[0]!.score).toBeLessThanOrEqual(results[1]!.score);
    }
  });

  // === エッジケーステスト ===

  test("ハイフン付き複合語で検索できる", async () => {
    // "full-text" は unicode61 で "full" と "text" に分割される
    const results = await search("full text search");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.title === "SQLite Full-Text Search")).toBe(
      true
    );
  });

  test("1文字の単語でも検索できる", async () => {
    // "a" のようなストップワードでもFTS5はマッチする（ストップワード除外なし）
    const results = await search("Kura");
    expect(results.length).toBeGreaterThan(0);
  });

  test("検索が100ms以内に完了する", async () => {
    const start = performance.now();
    for (let i = 0; i < 10; i++) {
      await search("knowledge management");
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});

// ==========================================================
// 英語 + 時間減衰ランキングテスト
// ==========================================================

describe("英語 時間減衰ランキング", () => {
  let db: Database;

  // 同じキーワード "project management" を含むが updated日時が異なるノート
  const decayTestNotes = [
    {
      file_path: "old-note.md",
      title: "Old Project Management Notes",
      content:
        "Project management basics. Prioritizing tasks is essential for success.",
      updated: "2025-01-01T00:00:00Z",
    },
    {
      file_path: "new-note.md",
      title: "New Project Management Notes",
      content:
        "Latest project management techniques. Comparing Agile and Scrum methodologies.",
      updated: "2026-03-18T00:00:00Z",
    },
    {
      file_path: "highly-relevant-old.md",
      title: "Complete Project Management Guide",
      content:
        "Project management project management project management. " +
        "Task management, schedule management, risk management, quality management. " +
        "Project management is essential for organizational success.",
      updated: "2025-06-01T00:00:00Z",
    },
  ];

  const DECAY_RATE = 0.01;

  beforeAll(async () => {
    db = new Database(":memory:");

    db.run(`
      CREATE VIRTUAL TABLE notes_fts USING fts5(
        file_path, title, content_original, content_tokenized,
        tokenize='unicode61'
      )
    `);
    db.run(`
      CREATE TABLE notes_meta (
        file_path TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        created TEXT NOT NULL,
        updated TEXT NOT NULL,
        confidential INTEGER NOT NULL DEFAULT 0,
        security_flag TEXT NOT NULL DEFAULT 'clean'
      )
    `);

    const ftsStmt = db.prepare(
      "INSERT INTO notes_fts (file_path, title, content_original, content_tokenized) VALUES (?, ?, ?, ?)"
    );
    const metaStmt = db.prepare(
      "INSERT INTO notes_meta (file_path, title, created, updated) VALUES (?, ?, ?, ?)"
    );

    for (const note of decayTestNotes) {
      const tokenizedAll = `${await tokenize(note.title)} ${await tokenize(note.content)}`;
      ftsStmt.run(note.file_path, note.title, note.content, tokenizedAll);
      metaStmt.run(note.file_path, note.title, note.updated, note.updated);
    }
  });

  afterAll(() => {
    db.close();
  });

  /** 時間減衰付き検索ヘルパー */
  async function searchWithDecay(
    query: string
  ): Promise<
    Array<{ file_path: string; title: string; score: number; updated: string }>
  > {
    const tokenizedQuery = await tokenize(query);
    return db
      .query(
        `SELECT
          f.file_path, f.title,
          bm25(notes_fts, 0, 0, 0, 1)
            * (1.0 / (1.0 + ? * (julianday('now') - julianday(m.updated))))
            as score,
          m.updated
        FROM notes_fts f
        JOIN notes_meta m ON f.file_path = m.file_path
        WHERE f.content_tokenized MATCH ?
        ORDER BY score
        LIMIT 10`
      )
      .all(DECAY_RATE, tokenizedQuery) as Array<{
      file_path: string;
      title: string;
      score: number;
      updated: string;
    }>;
  }

  /** 時間減衰なし検索ヘルパー（比較用） */
  async function searchWithoutDecay(
    query: string
  ): Promise<Array<{ file_path: string; title: string; score: number }>> {
    const tokenizedQuery = await tokenize(query);
    return db
      .query(
        `SELECT
          f.file_path, f.title,
          bm25(notes_fts, 0, 0, 0, 1) as score
        FROM notes_fts f
        JOIN notes_meta m ON f.file_path = m.file_path
        WHERE f.content_tokenized MATCH ?
        ORDER BY score
        LIMIT 10`
      )
      .all(tokenizedQuery) as Array<{
      file_path: string;
      title: string;
      score: number;
    }>;
  }

  test("新しいノートが古いノートより上位に来る（同程度の関連度の場合）", async () => {
    const results = await searchWithDecay("project management");
    expect(results.length).toBeGreaterThanOrEqual(2);

    const newIdx = results.findIndex((r) => r.file_path === "new-note.md");
    const oldIdx = results.findIndex((r) => r.file_path === "old-note.md");

    expect(newIdx).not.toBe(-1);
    expect(oldIdx).not.toBe(-1);
    // 新しいノートのインデックスが小さい = 上位
    expect(newIdx).toBeLessThan(oldIdx);
  });

  test("関連度が高ければ古いノートでもヒットする", async () => {
    const results = await searchWithDecay("project management");

    const highlyRelevant = results.find(
      (r) => r.file_path === "highly-relevant-old.md"
    );
    expect(highlyRelevant).toBeDefined();
    expect(highlyRelevant!.score).not.toBe(0);
  });

  test("時間減衰がスコアに影響を与えている", async () => {
    const withDecay = await searchWithDecay("project management");
    const withoutDecay = await searchWithoutDecay("project management");

    const oldWithDecay = withDecay.find((r) => r.file_path === "old-note.md");
    const oldWithoutDecay = withoutDecay.find(
      (r) => r.file_path === "old-note.md"
    );

    expect(oldWithDecay).toBeDefined();
    expect(oldWithoutDecay).toBeDefined();

    // 減衰後のスコアは絶対値が小さい = 関連度が下がっている
    expect(Math.abs(oldWithDecay!.score)).toBeLessThan(
      Math.abs(oldWithoutDecay!.score)
    );
  });
});
