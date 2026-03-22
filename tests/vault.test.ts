/**
 * Vault管理サービスのテスト
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "fs";
import path from "path";
import {
  initVault,
  isVault,
  findVaultRoot,
  getVaultPaths,
} from "../src/services/vault.ts";

const TEST_DIR = path.join(import.meta.dir, "../.test-vault-tmp");

describe("Vault管理", () => {
  beforeEach(() => {
    // テスト用ディレクトリを毎回クリーン作成
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("initVault で .kura/ ディレクトリが作成される", () => {
    const paths = initVault(TEST_DIR);

    expect(existsSync(paths.kuraDir)).toBe(true);
    expect(existsSync(paths.indexDb)).toBe(true);
    expect(existsSync(paths.configFile)).toBe(true);
  });

  test("isVault は .kura/ があれば true を返す", () => {
    expect(isVault(TEST_DIR)).toBe(false);

    initVault(TEST_DIR);

    expect(isVault(TEST_DIR)).toBe(true);
  });

  test("既にVaultがある場所で initVault するとエラー", () => {
    initVault(TEST_DIR);

    expect(() => initVault(TEST_DIR)).toThrow("既にVaultが存在します");
  });

  test("findVaultRoot は親方向に .kura/ を探す", () => {
    initVault(TEST_DIR);

    // サブディレクトリから探索
    const subDir = path.join(TEST_DIR, "projects", "kura");
    mkdirSync(subDir, { recursive: true });

    const found = findVaultRoot(subDir);
    expect(found).toBe(TEST_DIR);
  });

  test("findVaultRoot は Vault がなければ null を返す", () => {
    // initしていないのでVaultが見つからない
    const found = findVaultRoot("/tmp/non-existent-vault-test-12345");
    expect(found).toBeNull();
  });

  test("getVaultPaths は正しいパスを返す", () => {
    const paths = getVaultPaths(TEST_DIR);

    expect(paths.root).toBe(TEST_DIR);
    expect(paths.kuraDir).toBe(path.join(TEST_DIR, ".kura"));
    expect(paths.indexDb).toBe(path.join(TEST_DIR, ".kura", "index.db"));
    expect(paths.configFile).toBe(
      path.join(TEST_DIR, ".kura", "config.toml")
    );
  });
});
