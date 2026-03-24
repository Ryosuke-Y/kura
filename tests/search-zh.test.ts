/**
 * 中国語検索統合テスト
 *
 * language: "zh" 設定での全文検索精度を検証する。
 * 中国語トークナイザーはIntl.Segmenter("zh", { granularity: "word" })を使用。
 *
 * 既知の制限:
 * - 一部の複合語が過分割される（例: 轻量级 → 轻 量 级）
 * - 分割は登録時と検索時で一貫しているため、検索自体は機能する
 * - 過分割による偽陽性リスクはあるが、個人KM規模では実用上問題なし
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { initTokenizer, tokenize } from "../src/services/tokenizer.ts";

// 中国語トークナイザーを初期化
beforeAll(() => {
  initTokenizer("zh");
});

describe("中国語FTS5統合検索", () => {
  let db: Database;

  const testNotes = [
    {
      title: "知识管理工具对比",
      content: "知识管理工具帮助高效整理、保存和检索信息。",
    },
    {
      title: "Kura项目计划",
      content: "Kura是轻量级本地知识库管理工具。采用CLI优先设计，无需Electron。",
    },
    {
      title: "SQLite全文搜索实现",
      content: "FTS5是SQLite的全文搜索引擎。支持BM25排名和前缀查询。",
    },
    {
      title: "本地LLM集成",
      content: "在本地运行Qwen 9B，与知识库集成实现语义搜索。",
    },
    {
      title: "基于Markdown的设计",
      content:
        "纯Markdown文件可用任何编辑器编辑：Obsidian、VS Code或Vim。",
    },
  ];

  beforeAll(async () => {
    db = new Database(":memory:");

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
      const tokenizedAll = `${await tokenize(note.title)} ${await tokenize(note.content)}`;
      stmt.run(note.title, note.content, tokenizedAll);
    }
  });

  afterAll(() => {
    db.close();
  });

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

  test("中国語キーワードで関連ノートがヒットする", async () => {
    const results = await search("知识管理");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.title === "知识管理工具对比")).toBe(true);
  });

  test("単語検索でヒットする", async () => {
    const results = await search("搜索");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.title === "SQLite全文搜索实现")).toBe(true);
  });

  test("複合語の検索が一貫して動作する", async () => {
    // 「轻量级」はIntl.Segmenterで「轻 量 级」に過分割されるが、
    // 登録時も検索時も同じ分割なのでAND検索としてヒットする
    const results = await search("轻量级");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.title === "Kura项目计划")).toBe(true);
  });

  test("複数単語のAND検索ができる", async () => {
    const results = await search("本地 知识库");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.title === "Kura项目计划")).toBe(true);
  });

  test("中英混在テキストで検索できる", async () => {
    const results = await search("SQLite");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.title === "SQLite全文搜索实现")).toBe(true);
  });

  test("Markdown関連ノートが検索できる", async () => {
    const results = await search("Markdown");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.title === "基于Markdown的设计")).toBe(true);
  });

  // === エッジケーステスト ===

  test("存在しないキーワードでは0件返る", async () => {
    const results = await search("区块链");
    expect(results.length).toBe(0);
  });

  test("検索結果がBM25スコア順にソートされている", async () => {
    const results = await search("知识");
    if (results.length >= 2) {
      expect(results[0]!.score).toBeLessThanOrEqual(results[1]!.score);
    }
  });

  test("検索が100ms以内に完了する", async () => {
    const start = performance.now();
    for (let i = 0; i < 10; i++) {
      await search("知识管理");
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});

// ==========================================================
// 中国語 トークナイザー分割精度テスト
// ==========================================================

describe("中国語 トークナイザー分割精度", () => {
  // Intl.Segmenterの分割品質を記録・監視するテスト。
  // 将来Bunのバージョンアップでセグメンテーションが改善/変化した場合に検知できる。

  test("一般的な二字熟語が正しく分割される", async () => {
    const result = await tokenize("搜索引擎");
    const tokens = result.split(" ");
    // 「搜索」「引擎」に分割されることを期待
    expect(tokens).toContain("搜索");
    expect(tokens).toContain("引擎");
  });

  test("知识管理が二語に分割される", async () => {
    const result = await tokenize("知识管理");
    const tokens = result.split(" ");
    expect(tokens).toContain("知识");
    expect(tokens).toContain("管理");
  });

  test("英語部分がそのまま保持される", async () => {
    const result = await tokenize("使用SQLite数据库");
    expect(result).toContain("SQLite");
  });

  test("空文字列がエラーにならない", async () => {
    const result = await tokenize("");
    expect(result).toBe("");
  });
});

// ==========================================================
// 中国語 + 時間減衰ランキングテスト
// ==========================================================

describe("中国語 時間減衰ランキング", () => {
  let db: Database;

  const decayTestNotes = [
    {
      file_path: "old-note.md",
      title: "旧项目管理笔记",
      content: "项目管理的基本方法。任务优先级排序非常重要。",
      updated: "2025-01-01T00:00:00Z",
    },
    {
      file_path: "new-note.md",
      title: "新项目管理笔记",
      content: "最新的项目管理技术。敏捷开发与Scrum方法论的比较。",
      updated: "2026-03-18T00:00:00Z",
    },
    {
      file_path: "highly-relevant-old.md",
      title: "项目管理完全指南",
      content:
        "项目管理 项目管理 项目管理。" +
        "任务管理、进度管理、风险管理、质量管理全覆盖。" +
        "项目管理对组织成功至关重要。",
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

  test("新しいノートが古いノートより上位に来る", async () => {
    const results = await searchWithDecay("项目管理");
    expect(results.length).toBeGreaterThanOrEqual(2);

    const newIdx = results.findIndex((r) => r.file_path === "new-note.md");
    const oldIdx = results.findIndex((r) => r.file_path === "old-note.md");

    expect(newIdx).not.toBe(-1);
    expect(oldIdx).not.toBe(-1);
    expect(newIdx).toBeLessThan(oldIdx);
  });

  test("関連度が高ければ古いノートでもヒットする", async () => {
    const results = await searchWithDecay("项目管理");

    const highlyRelevant = results.find(
      (r) => r.file_path === "highly-relevant-old.md"
    );
    expect(highlyRelevant).toBeDefined();
    expect(highlyRelevant!.score).not.toBe(0);
  });

  test("時間減衰がスコアに影響を与えている", async () => {
    const withDecay = await searchWithDecay("项目管理");
    const withoutDecay = await searchWithoutDecay("项目管理");

    const oldWithDecay = withDecay.find((r) => r.file_path === "old-note.md");
    const oldWithoutDecay = withoutDecay.find(
      (r) => r.file_path === "old-note.md"
    );

    expect(oldWithDecay).toBeDefined();
    expect(oldWithoutDecay).toBeDefined();

    expect(Math.abs(oldWithDecay!.score)).toBeLessThan(
      Math.abs(oldWithoutDecay!.score)
    );
  });
});
