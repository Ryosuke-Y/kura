/**
 * Kura Web UI サーバー
 *
 * Hono + HTMX で構成されたローカルホストサーバー。
 * 既存のservices層を使って、ブラウザからノートの閲覧・検索ができる。
 */

import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import path from "path";
import type { VaultPaths } from "../services/vault.ts";
import { loadConfig } from "../services/config.ts";
import { initTokenizer } from "../services/tokenizer.ts";
import { dashboardRoute } from "./routes/dashboard.ts";
import { notesRoute } from "./routes/notes.ts";
import { searchRoute } from "./routes/search.ts";
import { apiRoute } from "./routes/api.ts";

/**
 * Honoアプリを構築する
 *
 * VaultPathsを受け取り、各ルートにDIする。
 * テスト時にもこの関数を使ってアプリを作成できる。
 */
export function createApp(paths: VaultPaths): Hono {
  // 言語設定を読み込んでトークナイザーを初期化
  const config = loadConfig(paths);
  initTokenizer(config.vault.language);

  const app = new Hono();

  // ミドルウェア
  app.use("*", logger());

  // 静的ファイル配信
  app.use(
    "/static/*",
    serveStatic({
      root: path.relative(process.cwd(), path.join(import.meta.dir, "..")),
      rewriteRequestPath: (p) => p.replace(/^\/static/, "/serve/static"),
    })
  );

  // ルート登録
  app.route("/api", apiRoute(paths));     // JSON API（エージェント連携）
  app.route("/", dashboardRoute(paths));  // Web UI
  app.route("/notes", notesRoute(paths));
  app.route("/search", searchRoute(paths));

  return app;
}

/**
 * サーバーを起動する
 */
export function startServer(
  paths: VaultPaths,
  port: number = 3847
): { stop: () => void } {
  const app = createApp(paths);

  const server = Bun.serve({
    port,
    fetch: app.fetch,
  });

  console.log(`Kura Web UI: http://localhost:${server.port}`);

  return {
    stop: () => server.stop(),
  };
}
