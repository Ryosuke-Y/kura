/**
 * kura show コマンド
 *
 * ノートの内容を表示する。
 */

import { Command } from "commander";
import { readNote } from "../../services/note.ts";
import { findVaultRoot } from "../../services/vault.ts";

export const showCommand = new Command("show")
  .description("ノートの内容を表示する")
  .argument("<path>", "ノートのパス（Vaultルートからの相対パス）")
  .option("--meta", "frontmatterのメタデータも表示する")
  .action((notePath: string, options: { meta?: boolean }) => {
    const vaultRoot = findVaultRoot(process.cwd());
    if (!vaultRoot) {
      console.error("エラー: Vaultが見つかりません。");
      process.exit(1);
    }

    try {
      const note = readNote(vaultRoot, notePath);

      if (options.meta) {
        const fm = note.frontmatter;
        console.log(`タイトル: ${fm.title}`);
        console.log(`タグ: ${fm.tags.length > 0 ? fm.tags.join(", ") : "(なし)"}`);
        console.log(`作成: ${fm.created}`);
        console.log(`更新: ${fm.updated}`);
        console.log(`---`);
      }

      console.log(note.content);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`エラー: ${message}`);
      process.exit(1);
    }
  });
