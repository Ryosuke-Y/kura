/**
 * 検索ルート
 *
 * GET /search?q=... — 全文検索
 */

import { Hono } from "hono";
import type { VaultPaths } from "../../services/vault.ts";
import { searchNotes } from "../../services/search.ts";
import { loadConfig } from "../../services/config.ts";
import { layout, fragment } from "../views/layout.ts";
import { searchView, searchResultsView } from "../views/search.ts";

export function searchRoute(paths: VaultPaths): Hono {
  const app = new Hono();
  const config = loadConfig(paths);

  app.get("/", async (c) => {
    const query = c.req.query("q") ?? "";

    let results: Awaited<ReturnType<typeof searchNotes>>["results"] = [];
    let excludedConfidential = 0;
    let searchError = "";

    if (query.trim()) {
      try {
        const searchResult = await searchNotes(paths, query, 10, config.search.decayRate);
        results = searchResult.results;
        excludedConfidential = searchResult.meta.excludedConfidential;
      } catch (err) {
        searchError = err instanceof Error ? err.message : String(err);
      }
    }

    // 検索エラー時はエラーメッセージを表示
    if (searchError) {
      const errorHtml = `<div class="empty">検索中にエラーが発生しました。<br><code>${searchError}</code></div>`;
      if (c.req.header("HX-Request")) {
        return c.html(fragment(errorHtml), 500);
      }
      const content = searchView({ query, results: [], excludedConfidential: 0 });
      return c.html(layout({ title: "検索", content: content.replace('id="search-results">', `id="search-results">${errorHtml}`), currentPath: "/search" }), 500);
    }

    const data = { query, results, excludedConfidential };

    // HTMXからのリクエストで、hx-targetが#search-resultsの場合は結果部分のみ返す
    if (c.req.header("HX-Request") && c.req.header("HX-Target") === "search-results") {
      return c.html(searchResultsView(data));
    }

    const content = searchView(data);

    if (c.req.header("HX-Request")) {
      return c.html(fragment(content));
    }
    return c.html(layout({ title: "検索", content, currentPath: "/search" }));
  });

  return app;
}
