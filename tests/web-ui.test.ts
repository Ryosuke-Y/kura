/**
 * Web UI E2Eテスト
 *
 * Honoの app.request() を使い、ブラウザ不要でHTMLレスポンスを検証する。
 * 各ルートの正常表示、HTMX部分更新、エラーハンドリングをカバー。
 *
 * テスト用Vaultを作成 → ノート登録 → インデックス構築 → 各ルートにリクエスト
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import path from "path";
import { initVault, getVaultPaths } from "../src/services/vault.ts";
import { rebuildIndex } from "../src/services/indexer.ts";
import { createApp } from "../src/serve/index.ts";

const TEST_VAULT = path.join(import.meta.dir, "../.test-webui-tmp");

function writeNote(filename: string, content: string): void {
  const filePath = path.join(TEST_VAULT, filename);
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, content, "utf-8");
}

let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  if (existsSync(TEST_VAULT)) rmSync(TEST_VAULT, { recursive: true });
  mkdirSync(TEST_VAULT, { recursive: true });
  initVault(TEST_VAULT);

  // テストは日本語ノートを使うのでlanguageをjaに設定
  const configPath = path.join(TEST_VAULT, ".kura", "config.toml");
  const config = readFileSync(configPath, "utf-8").replace(
    'language = "en"',
    'language = "ja"'
  );
  writeFileSync(configPath, config, "utf-8");

  writeNote(
    "getting-started.md",
    `---
title: Kura入門ガイド
tags: [guide, beginner]
created: 2026-03-20T00:00:00+09:00
updated: 2026-03-20T00:00:00+09:00
confidential: false
security_flag: clean
---
Kuraは**軽量な**知識管理ツールです。Markdownでノートを書きます。`
  );

  writeNote(
    "projects/kura-design.md",
    `---
title: Kura設計メモ
tags: [design, architecture]
created: 2026-03-18T00:00:00+09:00
updated: 2026-03-21T00:00:00+09:00
confidential: false
security_flag: clean
---
レイヤードアーキテクチャを採用。CLIとWeb UIでservices層を共有する。`
  );

  writeNote(
    "secret.md",
    `---
title: 機密メモ
tags: []
created: 2026-03-19T00:00:00+09:00
updated: 2026-03-19T00:00:00+09:00
confidential: true
security_flag: clean
---
社外秘の内容。`
  );

  const paths = getVaultPaths(TEST_VAULT);
  await rebuildIndex(paths);
  app = createApp(paths);
});

afterAll(() => {
  if (existsSync(TEST_VAULT)) rmSync(TEST_VAULT, { recursive: true });
});

/** 通常リクエスト（フルHTML） */
async function get(urlPath: string): Promise<{ status: number; html: string }> {
  const res = await app.request(urlPath);
  return { status: res.status, html: await res.text() };
}

/** HTMXリクエスト（部分更新） */
async function htmxGet(
  urlPath: string,
  target?: string
): Promise<{ status: number; html: string }> {
  const headers: Record<string, string> = { "HX-Request": "true" };
  if (target) headers["HX-Target"] = target;
  const res = await app.request(urlPath, { headers });
  return { status: res.status, html: await res.text() };
}

// ==========================================================
// ダッシュボード（GET /）
// ==========================================================

describe("ダッシュボード", () => {
  test("200を返し、フルHTMLレイアウトを含む", async () => {
    const { status, html } = await get("/");
    expect(status).toBe(200);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<title>");
    expect(html).toContain("蔵 Kura");
  });

  test("ナビゲーションが表示される", async () => {
    const { html } = await get("/");
    expect(html).toContain("ダッシュボード");
    expect(html).toContain("ノート一覧");
    expect(html).toContain("検索");
  });

  test("検索フォームが表示される", async () => {
    const { html } = await get("/");
    expect(html).toContain('<input type="search"');
    expect(html).toContain('name="q"');
  });

  test("最近のノートが表示される", async () => {
    const { html } = await get("/");
    expect(html).toContain("Kura入門ガイド");
    expect(html).toContain("Kura設計メモ");
  });

  test("HTMXリクエストではフラグメントのみ返す", async () => {
    const { status, html } = await htmxGet("/");
    expect(status).toBe(200);
    // フルHTMLレイアウト（<!DOCTYPE html>）を含まない
    expect(html).not.toContain("<!DOCTYPE html>");
    // コンテンツは含まれる
    expect(html).toContain("Kura入門ガイド");
  });
});

// ==========================================================
// ノート一覧（GET /notes）
// ==========================================================

describe("ノート一覧", () => {
  test("200を返し、全ノートが表示される", async () => {
    const { status, html } = await get("/notes");
    expect(status).toBe(200);
    expect(html).toContain("ノート一覧");
    expect(html).toContain("Kura入門ガイド");
    expect(html).toContain("Kura設計メモ");
  });

  test("ノート件数が表示される", async () => {
    const { html } = await get("/notes");
    // 3件（getting-started, kura-design, secret）
    expect(html).toContain("3件");
  });

  test("各ノートへのリンクが存在する", async () => {
    const { html } = await get("/notes");
    expect(html).toContain("/notes/getting-started.md");
  });

  test("HTMXリクエストではフラグメントのみ返す", async () => {
    const { html } = await htmxGet("/notes");
    expect(html).not.toContain("<!DOCTYPE html>");
    expect(html).toContain("ノート一覧");
  });
});

// ==========================================================
// ノート閲覧（GET /notes/:path）
// ==========================================================

describe("ノート閲覧", () => {
  test("ノートの内容がHTMLレンダリングされる", async () => {
    const { status, html } = await get("/notes/getting-started.md");
    expect(status).toBe(200);
    expect(html).toContain("Kura入門ガイド");
    // Markdownの**太字**がHTMLの<strong>にレンダリングされる
    expect(html).toContain("<strong>");
  });

  test("メタ情報（ファイルパス、作成日、更新日）が表示される", async () => {
    const { html } = await get("/notes/getting-started.md");
    expect(html).toContain("getting-started.md");
    expect(html).toContain("作成:");
    expect(html).toContain("更新:");
  });

  test("タグが表示される", async () => {
    const { html } = await get("/notes/getting-started.md");
    expect(html).toContain("guide");
    expect(html).toContain("beginner");
  });

  test("編集ボタンが表示される", async () => {
    const { html } = await get("/notes/getting-started.md");
    expect(html).toContain("編集");
    expect(html).toContain("hx-get");
    expect(html).toContain("/edit");
  });

  test("サブディレクトリのノートを表示できる", async () => {
    const { status, html } = await get(
      `/notes/${encodeURIComponent("projects/kura-design.md")}`
    );
    expect(status).toBe(200);
    expect(html).toContain("Kura設計メモ");
    expect(html).toContain("レイヤードアーキテクチャ");
  });

  test("存在しないノートで404を返す", async () => {
    const { status, html } = await get("/notes/nonexistent.md");
    expect(status).toBe(404);
    expect(html).toContain("見つかりません");
  });

  test("HTMXリクエストではフラグメントのみ返す", async () => {
    const { html } = await htmxGet("/notes/getting-started.md");
    expect(html).not.toContain("<!DOCTYPE html>");
    expect(html).toContain("Kura入門ガイド");
  });

  test("HTMXで404の場合もフラグメントで返す", async () => {
    const { status, html } = await htmxGet("/notes/nonexistent.md");
    expect(status).toBe(404);
    expect(html).not.toContain("<!DOCTYPE html>");
    expect(html).toContain("見つかりません");
  });
});

// ==========================================================
// ノート編集（GET /notes/:path/edit, PUT /notes/:path）
// ==========================================================

describe("ノート編集", () => {
  test("編集フォームが返される", async () => {
    const { status, html } = await htmxGet("/notes/getting-started.md/edit");
    expect(status).toBe(200);
    expect(html).toContain("編集:");
    expect(html).toContain("<textarea");
    expect(html).toContain("保存");
    expect(html).toContain("キャンセル");
  });

  test("テキストエリアにMarkdown本文が含まれる", async () => {
    const { html } = await htmxGet("/notes/getting-started.md/edit");
    // Markdown本文がエスケープされてtextarea内に表示される
    expect(html).toContain("知識管理ツール");
  });

  test("PUTでノートを保存できる", async () => {
    const newContent = "更新されたテスト内容。保存テスト。";
    const res = await app.request("/notes/getting-started.md", {
      method: "PUT",
      body: new URLSearchParams({ content: newContent }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    // 保存後は閲覧ビューが返される
    expect(html).toContain("更新されたテスト内容");
  });
});

// ==========================================================
// 検索（GET /search）
// ==========================================================

describe("検索ページ", () => {
  test("クエリなしで検索フォームが表示される", async () => {
    const { status, html } = await get("/search");
    expect(status).toBe(200);
    expect(html).toContain('<input type="search"');
    expect(html).toContain("キーワードを入力して検索してください");
  });

  test("クエリ付きで検索結果が表示される", async () => {
    const { status, html } = await get("/search?q=知識管理");
    expect(status).toBe(200);
    expect(html).toContain("検索結果");
    expect(html).toContain("Kura入門ガイド");
  });

  test("検索結果にスニペットが含まれる", async () => {
    // 「採用」は本文のトークンに含まれる（kuromojiで独立した動詞として分割される）
    const { html } = await get("/search?q=採用");
    expect(html).toContain("snippet");
    expect(html).toContain("Kura設計メモ");
  });

  test("検索結果からノートへのリンクが存在する", async () => {
    const { html } = await get("/search?q=知識管理");
    expect(html).toContain("/notes/");
    expect(html).toContain("hx-get");
  });

  test("ヒットなしの場合にメッセージが表示される", async () => {
    const { html } = await get("/search?q=存在しないワード12345");
    expect(html).toContain("検索結果はありません");
  });

  test("HTMX部分更新: HX-Target=search-resultsで結果のみ返す", async () => {
    const { status, html } = await htmxGet(
      "/search?q=知識管理",
      "search-results"
    );
    expect(status).toBe(200);
    // フルレイアウトでも検索フォームでもなく、結果部分のみ
    expect(html).not.toContain("<!DOCTYPE html>");
    expect(html).not.toContain('<input type="search"');
    expect(html).toContain("検索結果");
    expect(html).toContain("Kura入門ガイド");
  });

  test("HTMXリクエスト（ターゲット指定なし）ではフラグメント全体を返す", async () => {
    const { html } = await htmxGet("/search?q=知識管理");
    expect(html).not.toContain("<!DOCTYPE html>");
    // 検索フォームと結果の両方が含まれる
    expect(html).toContain('<input type="search"');
    expect(html).toContain("検索結果");
  });
});
