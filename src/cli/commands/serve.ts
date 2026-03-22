/**
 * kura serve コマンド
 *
 * ブラウザUIを起動する。localhost:3847（デフォルト）でアクセス。
 */

import { Command } from "commander";
import { findVaultRoot, getVaultPaths } from "../../services/vault.ts";
import { startServer } from "../../serve/index.ts";

export const serveCommand = new Command("serve")
  .description("ブラウザUIを起動する")
  .option("-p, --port <number>", "ポート番号", "3847")
  .action((options: { port: string }) => {
    const vaultRoot = findVaultRoot(process.cwd());
    if (!vaultRoot) {
      console.error("エラー: Vaultが見つかりません。");
      process.exit(1);
    }

    const paths = getVaultPaths(vaultRoot);
    const port = parseInt(options.port, 10);

    try {
      startServer(paths, port);
      console.log("Ctrl+C で停止します。");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("EADDRINUSE") || message.includes("address already in use")) {
        console.error(`エラー: ポート ${port} は既に使用されています。`);
        console.error(`ヒント: --port オプションで別のポートを指定してください。`);
      } else {
        console.error(`エラー: サーバー起動に失敗しました: ${message}`);
      }
      process.exit(1);
    }
  });
