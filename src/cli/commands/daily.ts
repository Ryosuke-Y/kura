/**
 * kura daily コマンド
 *
 * デイリーノートの作成・一覧表示を行う。
 * 引数なしで今日のデイリーノートを作成（または既存を表示）。
 */

import { Command } from "commander";
import { findVaultRoot } from "../../services/vault.ts";
import { createDailyNote, listDailyNotes } from "../../services/daily.ts";

export const dailyCommand = new Command("daily")
  .description("デイリーノートを作成する")
  .option("--date <date>", "指定日のデイリーノートを作成（YYYY-MM-DD）")
  .option("--list", "デイリーノート一覧を表示")
  .action((options: { date?: string; list?: boolean }) => {
    const vaultRoot = findVaultRoot(process.cwd());
    if (!vaultRoot) {
      console.error("エラー: Vaultが見つかりません。");
      process.exit(1);
    }

    try {
      if (options.list) {
        const notes = listDailyNotes(vaultRoot);

        if (notes.length === 0) {
          console.log("デイリーノートはまだありません。");
          console.log("ヒント: `kura daily` で今日のノートを作成できます。");
          return;
        }

        console.log(`デイリーノート (${notes.length}件):\n`);
        for (const note of notes) {
          console.log(`  ${note}`);
        }
        return;
      }

      // デイリーノート作成（冪等）
      const result = createDailyNote(vaultRoot, options.date);

      if (result.created) {
        console.log(`デイリーノートを作成しました: ${result.filePath}`);
      } else {
        console.log(`デイリーノートは既に存在します: ${result.filePath}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`エラー: ${message}`);
      process.exit(1);
    }
  });
