/**
 * デイリーノートサービスのテスト
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, existsSync, rmSync, readFileSync } from "fs";
import path from "path";
import {
  createDailyNote,
  listDailyNotes,
  isValidDate,
  todayDateStr,
} from "../src/services/daily.ts";

const TEST_VAULT = path.join(import.meta.dir, "../.test-daily-tmp");

describe("isValidDate", () => {
  test("有効な日付を受け付ける", () => {
    expect(isValidDate("2026-03-21")).toBe(true);
    expect(isValidDate("2026-01-01")).toBe(true);
    expect(isValidDate("2026-12-31")).toBe(true);
  });

  test("無効な形式を拒否する", () => {
    expect(isValidDate("2026/03/21")).toBe(false);
    expect(isValidDate("20260321")).toBe(false);
    expect(isValidDate("03-21-2026")).toBe(false);
    expect(isValidDate("")).toBe(false);
    expect(isValidDate("not-a-date")).toBe(false);
  });

  test("存在しない日付を拒否する", () => {
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
  });
});

describe("todayDateStr", () => {
  test("YYYY-MM-DD形式を返す", () => {
    const result = todayDateStr();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(isValidDate(result)).toBe(true);
  });
});

describe("createDailyNote", () => {
  beforeEach(() => {
    if (existsSync(TEST_VAULT)) {
      rmSync(TEST_VAULT, { recursive: true });
    }
    mkdirSync(TEST_VAULT, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_VAULT)) {
      rmSync(TEST_VAULT, { recursive: true });
    }
  });

  test("今日のデイリーノートを作成する", () => {
    const result = createDailyNote(TEST_VAULT);

    expect(result.created).toBe(true);
    expect(result.filePath).toContain("daily/");
    expect(result.filePath).toMatch(/\d{4}-\d{2}-\d{2}\.md$/);

    // ファイルが実際に作成されている
    const fullPath = path.join(TEST_VAULT, result.filePath);
    expect(existsSync(fullPath)).toBe(true);
  });

  test("指定日のデイリーノートを作成する", () => {
    const result = createDailyNote(TEST_VAULT, "2026-03-14");

    expect(result.created).toBe(true);
    expect(result.filePath).toBe("daily/2026-03-14.md");
  });

  test("作成されたノートにfrontmatterが含まれる", () => {
    createDailyNote(TEST_VAULT, "2026-03-14");

    const content = readFileSync(
      path.join(TEST_VAULT, "daily/2026-03-14.md"),
      "utf-8"
    );

    expect(content).toContain("title: 2026-03-14");
    expect(content).toContain("tags:");
    expect(content).toContain("daily");
    expect(content).toContain("created:");
    expect(content).toContain("updated:");
  });

  test("デフォルトテンプレートのセクションが含まれる", () => {
    createDailyNote(TEST_VAULT, "2026-03-14");

    const content = readFileSync(
      path.join(TEST_VAULT, "daily/2026-03-14.md"),
      "utf-8"
    );

    expect(content).toContain("## やること");
    expect(content).toContain("## メモ");
    expect(content).toContain("## ふりかえり");
  });

  test("同じ日のノートは二重作成されない（冪等）", () => {
    const first = createDailyNote(TEST_VAULT, "2026-03-14");
    expect(first.created).toBe(true);

    const second = createDailyNote(TEST_VAULT, "2026-03-14");
    expect(second.created).toBe(false);
    expect(second.filePath).toBe(first.filePath);
  });

  test("無効な日付でエラーを投げる", () => {
    expect(() => createDailyNote(TEST_VAULT, "invalid")).toThrow("無効な日付形式");
    expect(() => createDailyNote(TEST_VAULT, "2026-13-01")).toThrow("無効な日付形式");
  });

  test("daily/ディレクトリが自動作成される", () => {
    const dailyDir = path.join(TEST_VAULT, "daily");
    expect(existsSync(dailyDir)).toBe(false);

    createDailyNote(TEST_VAULT, "2026-03-14");

    expect(existsSync(dailyDir)).toBe(true);
  });
});

describe("listDailyNotes", () => {
  beforeEach(() => {
    if (existsSync(TEST_VAULT)) {
      rmSync(TEST_VAULT, { recursive: true });
    }
    mkdirSync(TEST_VAULT, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_VAULT)) {
      rmSync(TEST_VAULT, { recursive: true });
    }
  });

  test("デイリーノートがなければ空配列を返す", () => {
    const result = listDailyNotes(TEST_VAULT);
    expect(result.length).toBe(0);
  });

  test("作成したデイリーノートが一覧に含まれる", () => {
    createDailyNote(TEST_VAULT, "2026-03-14");
    createDailyNote(TEST_VAULT, "2026-03-15");

    const result = listDailyNotes(TEST_VAULT);
    expect(result.length).toBe(2);
    expect(result.some((p) => p.includes("2026-03-14"))).toBe(true);
    expect(result.some((p) => p.includes("2026-03-15"))).toBe(true);
  });
});
