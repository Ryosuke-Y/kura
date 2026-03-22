/**
 * kura create コマンド
 *
 * 新しいノートを作成し、$EDITORで開く。
 */

import { Command } from "commander";
import { createNote } from "../../services/note.ts";
import { findVaultRoot } from "../../services/vault.ts";
import { execSync } from "child_process";

export const createCommand = new Command("create")
  .description("新しいノートを作成する")
  .argument("<title>", "ノートのタイトル")
  .option("-d, --dir <dir>", "保存先ディレクトリ（例: inbox, projects）")
  .option("--no-edit", "作成後にエディタを開かない")
  .action((title: string, options: { dir?: string; edit: boolean }) => {
    const vaultRoot = findVaultRoot(process.cwd());
    if (!vaultRoot) {
      console.error(
        "エラー: Vaultが見つかりません。`kura init` でVaultを作成してください。"
      );
      process.exit(1);
    }

    try {
      const relativePath = createNote(vaultRoot, title, options.dir);
      console.log(`ノートを作成しました: ${relativePath}`);

      // --no-edit でなければエディタで開く
      if (options.edit) {
        const editor = process.env.EDITOR || "vi";
        const fullPath = `${vaultRoot}/${relativePath}`;
        try {
          execSync(`${editor} "${fullPath}"`, { stdio: "inherit" });
        } catch {
          // エディタが終了コード非0で終了しても無視
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`エラー: ${message}`);
      process.exit(1);
    }
  });
