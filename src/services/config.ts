/**
 * 設定ファイル読み込みサービス
 *
 * .kura/config.toml を型安全に読み込む。
 * 値がない場合はデフォルト値にフォールバックする。
 */

import { readFileSync, existsSync } from "fs";
import { parse } from "smol-toml";
import type { VaultPaths } from "./vault.ts";

/** Vault設定 */
export interface VaultConfig {
  readonly vault: {
    readonly name: string;
    readonly language: string;
  };
  readonly search: {
    readonly tokenizer: string;
    readonly decayRate: number;
  };
  readonly daily: {
    readonly directory: string;
  };
  readonly serve: {
    readonly port: number;
    readonly openBrowser: boolean;
  };
}

/** デフォルト設定 */
const DEFAULTS: VaultConfig = {
  vault: { name: "main", language: "ja" },
  search: { tokenizer: "kuromoji", decayRate: 0.01 },
  daily: { directory: "daily" },
  serve: { port: 3847, openBrowser: true },
};

/**
 * config.tomlを読み込み、デフォルト値とマージする
 *
 * ファイルが存在しない場合や特定のキーがない場合は
 * デフォルト値にフォールバックする。
 */
export function loadConfig(paths: VaultPaths): VaultConfig {
  if (!existsSync(paths.configFile)) {
    return DEFAULTS;
  }

  try {
    const raw = readFileSync(paths.configFile, "utf-8");
    const parsed = parse(raw) as Record<string, Record<string, unknown>>;

    const vault = parsed.vault ?? {};
    const search = parsed.search ?? {};
    const daily = parsed.daily ?? {};
    const serve = parsed.serve ?? {};

    return {
      vault: {
        name: asString(vault.name, DEFAULTS.vault.name),
        language: asString(vault.language, DEFAULTS.vault.language),
      },
      search: {
        tokenizer: asString(search.tokenizer, DEFAULTS.search.tokenizer),
        decayRate: asNumber(search.decay_rate, DEFAULTS.search.decayRate),
      },
      daily: {
        directory: asString(daily.directory, DEFAULTS.daily.directory),
      },
      serve: {
        port: asNumber(serve.port, DEFAULTS.serve.port),
        openBrowser: asBoolean(serve.open_browser, DEFAULTS.serve.openBrowser),
      },
    };
  } catch {
    // パースエラー時はデフォルト値を返す
    return DEFAULTS;
  }
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}
