/**
 * ノートCRUDサービスのテスト
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, existsSync } from "fs";
import path from "path";
import { initVault } from "../src/services/vault.ts";
import {
  createNote,
  readNote,
  updateNote,
  listNotes,
} from "../src/services/note.ts";

const TEST_DIR = path.join(import.meta.dir, "../.test-note-tmp");

describe("ノートCRUD", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    initVault(TEST_DIR);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  // === createNote ===

  test("ノートを作成できる", () => {
    const relativePath = createNote(TEST_DIR, "テストノート");

    expect(relativePath).toBe("テストノート.md");
    expect(existsSync(path.join(TEST_DIR, relativePath))).toBe(true);
  });

  test("サブディレクトリにノートを作成できる", () => {
    const relativePath = createNote(TEST_DIR, "プロジェクト計画", "projects");

    expect(relativePath).toBe("projects/プロジェクト計画.md");
    expect(existsSync(path.join(TEST_DIR, relativePath))).toBe(true);
  });

  test("同名ノートの作成はエラーになる", () => {
    createNote(TEST_DIR, "重複テスト");

    expect(() => createNote(TEST_DIR, "重複テスト")).toThrow(
      "ノートが既に存在します"
    );
  });

  test("ファイル名に使えない文字はハイフンに置換される", () => {
    const relativePath = createNote(TEST_DIR, "タイトル/サブ:テスト");

    expect(relativePath).toBe("タイトル-サブ-テスト.md");
  });

  // === readNote ===

  test("作成したノートを読み込める", () => {
    const relativePath = createNote(TEST_DIR, "読み込みテスト");
    const note = readNote(TEST_DIR, relativePath);

    expect(note.frontmatter.title).toBe("読み込みテスト");
    expect(note.filePath).toBe(relativePath);
    expect(note.frontmatter.confidential).toBe(false);
  });

  test("存在しないノートの読み込みはエラー", () => {
    expect(() => readNote(TEST_DIR, "存在しない.md")).toThrow(
      "ノートが見つかりません"
    );
  });

  // === updateNote ===

  test("ノートの内容を更新できる", () => {
    const relativePath = createNote(TEST_DIR, "更新テスト");
    const original = readNote(TEST_DIR, relativePath);

    const updated = updateNote(TEST_DIR, relativePath, "新しい本文\n");

    expect(updated.content).toBe("新しい本文\n");
    expect(updated.frontmatter.title).toBe("更新テスト");
    // updatedタイムスタンプが設定されている（空でない）
    expect(updated.frontmatter.updated.length).toBeGreaterThan(0);
    // createdは変わっていない
    expect(updated.frontmatter.created).toBe(original.frontmatter.created);
  });

  test("frontmatterの部分更新ができる", () => {
    const relativePath = createNote(TEST_DIR, "メタ更新テスト");

    const updated = updateNote(TEST_DIR, relativePath, "本文\n", {
      tags: ["test", "update"],
      confidential: true,
    });

    expect(updated.frontmatter.tags).toEqual(["test", "update"]);
    expect(updated.frontmatter.confidential).toBe(true);
    // 変更していないフィールドは保持
    expect(updated.frontmatter.title).toBe("メタ更新テスト");
  });

  // === listNotes ===

  test("ノート一覧を取得できる", () => {
    createNote(TEST_DIR, "ノート1");
    createNote(TEST_DIR, "ノート2");
    createNote(TEST_DIR, "ノート3", "inbox");

    const all = listNotes(TEST_DIR);
    expect(all.length).toBe(3);
  });

  test("サブディレクトリでフィルタできる", () => {
    createNote(TEST_DIR, "ルートノート");
    createNote(TEST_DIR, "プロジェクトノート", "projects");

    const projectNotes = listNotes(TEST_DIR, "projects");
    expect(projectNotes.length).toBe(1);
    expect(projectNotes[0]).toContain("projects/");
  });

  test("ノートがない場合は空配列を返す", () => {
    const notes = listNotes(TEST_DIR);
    expect(notes).toEqual([]);
  });
});
