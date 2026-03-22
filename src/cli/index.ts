/**
 * Kura CLI エントリポイント
 *
 * Commander.jsで各コマンドを登録し、引数をパースして実行する。
 *
 * 使い方:
 *   bun run src/cli/index.ts <command> [options]
 *   または将来的に: kura <command> [options]
 */

import { Command } from "commander";
import { initCommand } from "./commands/init.ts";
import { createCommand } from "./commands/create.ts";
import { showCommand } from "./commands/show.ts";
import { listCommand } from "./commands/list.ts";
import { editCommand } from "./commands/edit.ts";
import { searchCommand } from "./commands/search.ts";
import { indexCommand } from "./commands/index-cmd.ts";
import { auditCommand } from "./commands/audit.ts";
import { dailyCommand } from "./commands/daily.ts";
import { serveCommand } from "./commands/serve.ts";

const program = new Command();

program
  .name("kura")
  .description("蔵 — 軽量ローカルナレッジ管理ツール")
  .version("0.1.0");

// 各コマンドを登録
program.addCommand(initCommand);
program.addCommand(createCommand);
program.addCommand(showCommand);
program.addCommand(listCommand);
program.addCommand(editCommand);
program.addCommand(searchCommand);
program.addCommand(indexCommand);
program.addCommand(auditCommand);
program.addCommand(dailyCommand);
program.addCommand(serveCommand);

// 引数をパースして実行
program.parse();
