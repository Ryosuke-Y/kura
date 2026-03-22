/**
 * kura init コマンド
 *
 * カレントディレクトリまたは指定パスにVaultを作成する。
 */

import { Command } from "commander";
import path from "path";
import { initVault, isVault } from "../../services/vault.ts";

export const initCommand = new Command("init")
  .description("Kura Vaultを新規作成する")
  .argument("[path]", "Vaultを作成するパス（省略時はカレントディレクトリ）")
  .action((targetPath?: string) => {
    const vaultRoot = targetPath
      ? path.resolve(targetPath)
      : process.cwd();

    if (isVault(vaultRoot)) {
      console.error(`エラー: 既にVaultが存在します: ${vaultRoot}`);
      process.exit(1);
    }

    try {
      const paths = initVault(vaultRoot);
      console.log(`Kura Vaultを作成しました: ${paths.root}\n`);
      console.log("次のステップ:");
      console.log("  1. ノートを作成:     kura create \"最初のメモ\"");
      console.log("  2. インデックス構築:  kura index");
      console.log("  3. 検索:             kura search \"キーワード\"");
      console.log("  4. ブラウザUI:       kura serve");
      console.log(`\n設定ファイル: ${paths.configFile}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`エラー: ${message}`);
      process.exit(1);
    }
  });
