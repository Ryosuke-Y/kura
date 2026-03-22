/**
 * kura edit コマンド
 *
 * 既存のノートを$EDITORで開く。
 */

import { Command } from "commander";
import { findVaultRoot } from "../../services/vault.ts";
import { existsSync } from "fs";
import path from "path";
import { execSync } from "child_process";

export const editCommand = new Command("edit")
  .description("ノートをエディタで開く")
  .argument("<path>", "ノートのパス（Vaultルートからの相対パス）")
  .action((notePath: string) => {
    const vaultRoot = findVaultRoot(process.cwd());
    if (!vaultRoot) {
      console.error("エラー: Vaultが見つかりません。");
      process.exit(1);
    }

    const fullPath = path.join(vaultRoot, notePath);
    if (!existsSync(fullPath)) {
      console.error(`エラー: ノートが見つかりません: ${notePath}`);
      process.exit(1);
    }

    const editor = process.env.EDITOR || "vi";
    try {
      execSync(`${editor} "${fullPath}"`, { stdio: "inherit" });
    } catch {
      // エディタ終了コードが非0でも無視
    }
  });
