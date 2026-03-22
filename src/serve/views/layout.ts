/**
 * 共通HTMLレイアウト
 *
 * 全ページで共有するヘッダー、ナビゲーション、HTMX読み込み。
 * HTMXにより、ナビリンクやフォームがページ全体の再読み込みなしで動作する。
 */

/** レイアウトに渡すパラメータ */
export interface LayoutParams {
  readonly title: string;
  readonly content: string;
  readonly currentPath?: string; // ナビのアクティブ表示用
}

/** ナビゲーション項目 */
const NAV_ITEMS = [
  { href: "/", label: "ダッシュボード" },
  { href: "/notes", label: "ノート一覧" },
  { href: "/search", label: "検索" },
] as const;

export function layout(params: LayoutParams): string {
  const nav = NAV_ITEMS.map((item) => {
    const active = params.currentPath === item.href ? ' class="active"' : "";
    return `<a href="${item.href}" hx-get="${item.href}" hx-target="#main" hx-push-url="true"${active}>${item.label}</a>`;
  }).join("\n        ");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${params.title} — Kura</title>
  <link rel="stylesheet" href="/static/style.css">
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
</head>
<body>
  <header>
    <h1><a href="/" hx-get="/" hx-target="#main" hx-push-url="true">蔵 Kura</a></h1>
    <nav>
      ${nav}
    </nav>
  </header>
  <main id="main">
    ${params.content}
  </main>
</body>
</html>`;
}

/**
 * HTMX部分更新用のフラグメントを返す
 *
 * HTMXリクエスト（HX-Requestヘッダーあり）の場合、
 * <main>の中身だけを返せばよい（レイアウト不要）。
 */
export function fragment(content: string): string {
  return content;
}
