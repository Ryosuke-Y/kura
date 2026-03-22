/**
 * kura list コマンド
 *
 * Vault内のノート一覧を表示する。
 */

import { Command } from "commander";
import { listNotes, readNote } from "../../services/note.ts";
import { findVaultRoot } from "../../services/vault.ts";

export const listCommand = new Command("list")
  .description("ノート一覧を表示する")
  .option("-d, --dir <dir>", "サブディレクトリでフィルタ（例: inbox, projects）")
  .option("-n, --limit <number>", "表示件数の上限", "20")
  .action((options: { dir?: string; limit: string }) => {
    const vaultRoot = findVaultRoot(process.cwd());
    if (!vaultRoot) {
      console.error("エラー: Vaultが見つかりません。");
      process.exit(1);
    }

    const notes = listNotes(vaultRoot, options.dir);
    const limit = parseInt(options.limit, 10);

    if (notes.length === 0) {
      console.log("ノートがありません。");
      return;
    }

    const displayed = notes.slice(0, limit);

    for (const filePath of displayed) {
      try {
        const note = readNote(vaultRoot, filePath);
        const title = note.frontmatter.title || filePath;
        console.log(`  ${filePath}  — ${title}`);
      } catch {
        // frontmatterのパースに失敗してもファイル名は表示
        console.log(`  ${filePath}`);
      }
    }

    if (notes.length > limit) {
      console.log(`\n  ...他 ${notes.length - limit} 件（--limit で変更可能）`);
    }

    console.log(`\n合計: ${notes.length} 件`);
  });
