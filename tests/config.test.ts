/**
 * 設定ファイル読み込みのテスト
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import path from "path";
import { loadConfig } from "../src/services/config.ts";
import type { VaultPaths } from "../src/services/vault.ts";

const TEST_DIR = path.join(import.meta.dir, "../.test-config-tmp");

function makePaths(root: string): VaultPaths {
  const kuraDir = path.join(root, ".kura");
  return {
    root,
    kuraDir,
    indexDb: path.join(kuraDir, "index.db"),
    configFile: path.join(kuraDir, "config.toml"),
  };
}

describe("loadConfig", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(path.join(TEST_DIR, ".kura"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  test("config.tomlがなければデフォルト値を返す", () => {
    const paths = makePaths(TEST_DIR);
    rmSync(paths.configFile, { force: true });

    const config = loadConfig(paths);
    expect(config.search.decayRate).toBe(0.01);
    expect(config.serve.port).toBe(3847);
    expect(config.vault.language).toBe("en");
  });

  test("config.tomlからdecay_rateを読み込む", () => {
    const paths = makePaths(TEST_DIR);
    writeFileSync(
      paths.configFile,
      `[search]\ndecay_rate = 0.05\n`,
      "utf-8"
    );

    const config = loadConfig(paths);
    expect(config.search.decayRate).toBe(0.05);
    // 未指定の項目はデフォルト値
    expect(config.serve.port).toBe(3847);
  });

  test("config.tomlから複数セクションを読み込む", () => {
    const paths = makePaths(TEST_DIR);
    writeFileSync(
      paths.configFile,
      `[vault]\nname = "my-vault"\nlanguage = "en"\n\n[search]\ntokenizer = "trigram"\ndecay_rate = 0.02\n\n[serve]\nport = 4000\nopen_browser = false\n`,
      "utf-8"
    );

    const config = loadConfig(paths);
    expect(config.vault.name).toBe("my-vault");
    expect(config.vault.language).toBe("en");
    expect(config.search.tokenizer).toBe("trigram");
    expect(config.search.decayRate).toBe(0.02);
    expect(config.serve.port).toBe(4000);
    expect(config.serve.openBrowser).toBe(false);
  });

  test("不正なTOMLではデフォルト値を返す", () => {
    const paths = makePaths(TEST_DIR);
    writeFileSync(paths.configFile, "invalid toml {{{{", "utf-8");

    const config = loadConfig(paths);
    expect(config.search.decayRate).toBe(0.01);
  });
});
