/**
 * CLI統合テスト
 *
 * 実際にCLIコマンドをサブプロセスで実行して動作確認する。
 * ユニットテストでは検証しづらい「コマンド引数→出力」のE2Eフローを検証。
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, existsSync, writeFileSync } from "fs";
import path from "path";

const TEST_DIR = path.join(import.meta.dir, "../.test-cli-tmp");
const CLI = path.join(import.meta.dir, "../src/cli/index.ts");

/** CLIコマンドを実行してstdoutを返すヘルパー */
function runCli(args: string, cwd?: string): { stdout: string; exitCode: number } {
  const result = Bun.spawnSync(["bun", "run", CLI, ...args.split(" ")], {
    cwd: cwd ?? TEST_DIR,
    env: { ...process.env, NO_COLOR: "1" },
  });
  return {
    stdout: result.stdout.toString() + result.stderr.toString(),
    exitCode: result.exitCode,
  };
}

describe("CLI統合テスト", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    // テスト用ディレクトリを作成してVaultを初期化
    const initResult = Bun.spawnSync(["bun", "run", CLI, "init", TEST_DIR]);
    if (initResult.exitCode !== 0) {
      throw new Error(`init failed: ${initResult.stderr.toString()}`);
    }
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  // === kura init ===

  test("kura init でVaultが作成される", () => {
    expect(existsSync(path.join(TEST_DIR, ".kura"))).toBe(true);
    expect(existsSync(path.join(TEST_DIR, ".kura", "index.db"))).toBe(true);
    expect(existsSync(path.join(TEST_DIR, ".kura", "config.toml"))).toBe(true);
  });

  // === kura create ===

  test("kura create でノートが作成される", () => {
    const { stdout, exitCode } = runCli("create テストノート --no-edit");

    expect(exitCode).toBe(0);
    expect(stdout).toContain("ノートを作成しました");
    expect(existsSync(path.join(TEST_DIR, "テストノート.md"))).toBe(true);
  });

  test("kura create --dir でサブディレクトリに作成", () => {
    const { stdout, exitCode } = runCli("create プロジェクト --no-edit --dir projects");

    expect(exitCode).toBe(0);
    expect(existsSync(path.join(TEST_DIR, "projects", "プロジェクト.md"))).toBe(true);
  });

  // === kura show ===

  test("kura show でノート内容を表示", () => {
    runCli("create 表示テスト --no-edit");
    const { stdout, exitCode } = runCli("show 表示テスト.md --meta");

    expect(exitCode).toBe(0);
    expect(stdout).toContain("タイトル: 表示テスト");
  });

  // === kura list ===

  test("kura list でノート一覧を表示", () => {
    runCli("create ノートA --no-edit");
    runCli("create ノートB --no-edit");

    const { stdout, exitCode } = runCli("list");

    expect(exitCode).toBe(0);
    expect(stdout).toContain("ノートA");
    expect(stdout).toContain("ノートB");
    expect(stdout).toContain("合計: 2 件");
  });

  // === kura index + search ===

  test("kura index → search で日本語全文検索ができる", () => {
    // テスト用ノートを手動で作成（本文付き）
    const noteContent = `---
title: 知識管理ツール
tags: []
created: "2026-03-18T10:00:00Z"
updated: "2026-03-18T10:00:00Z"
confidential: false
security_flag: clean
---
知識管理ツールは情報を効率的に整理・保存・検索するためのソフトウェアです。
`;
    writeFileSync(path.join(TEST_DIR, "知識管理.md"), noteContent, "utf-8");

    // インデックス構築
    const indexResult = runCli("index");
    expect(indexResult.exitCode).toBe(0);
    expect(indexResult.stdout).toContain("1件更新");

    // 検索
    const searchResult = runCli("search 知識管理");
    expect(searchResult.exitCode).toBe(0);
    expect(searchResult.stdout).toContain("知識管理ツール");
  });

  test("kura search --format json でJSON出力", () => {
    const noteContent = `---
title: テストノート
tags: []
created: "2026-03-18T10:00:00Z"
updated: "2026-03-18T10:00:00Z"
confidential: false
security_flag: clean
---
Bunは高速なJavaScriptランタイムです。
`;
    writeFileSync(path.join(TEST_DIR, "bun-test.md"), noteContent, "utf-8");

    runCli("index");

    const { stdout, exitCode } = runCli("search Bun --format json");
    expect(exitCode).toBe(0);

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.results).toBeArray();
    expect(parsed.results.length).toBeGreaterThan(0);
    expect(parsed.results[0].title).toBe("テストノート");
  });

  test("検索結果がない場合のメッセージ", () => {
    runCli("index");

    const { stdout, exitCode } = runCli("search 存在しないキーワード");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("検索結果がありません");
  });
});
