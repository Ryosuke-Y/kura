/**
 * kura index コマンド
 *
 * FTS5インデックスを構築する。
 * デフォルトは差分更新（変更があったファイルのみ再インデックス）。
 * --force で全件再構築。
 */

import { Command } from "commander";
import { findVaultRoot, getVaultPaths } from "../../services/vault.ts";
import { rebuildIndex, incrementalIndex } from "../../services/indexer.ts";

export const indexCommand = new Command("index")
  .description("FTS5検索インデックスを構築する")
  .option("--force", "全件再構築する（デフォルトは差分更新）")
  .action(async (options: { force?: boolean }) => {
    const vaultRoot = findVaultRoot(process.cwd());
    if (!vaultRoot) {
      console.error("エラー: Vaultが見つかりません。");
      process.exit(1);
    }

    const paths = getVaultPaths(vaultRoot);

    if (options.force) {
      console.log("インデックスを全件再構築中...");
    } else {
      console.log("インデックスを差分更新中...");
    }

    try {
      const result = options.force
        ? await rebuildIndex(paths)
        : await incrementalIndex(paths);

      console.log(`完了: ${result.indexedNotes}件更新, ${result.skippedNotes}件スキップ, ${result.deletedNotes}件削除 (全${result.totalNotes}件)`);
      console.log(`所要時間: ${result.elapsedMs.toFixed(0)}ms`);

      if (result.errors.length > 0) {
        console.log(`\n警告: ${result.errors.length} 件のエラー:`);
        for (const err of result.errors) {
          console.log(`  - ${err}`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`エラー: ${message}`);
      process.exit(1);
    }
  });
