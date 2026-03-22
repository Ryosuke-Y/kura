/**
 * 検索ビュー
 *
 * 検索フォームと検索結果を表示する。
 * HTMXでフォーム送信し、結果部分のみ更新する。
 */

import type { SearchResult } from "../../services/search.ts";

export interface SearchViewData {
  readonly query: string;
  readonly results: readonly SearchResult[];
  readonly excludedConfidential: number;
}

/** 検索ページ全体（フォーム + 結果） */
export function searchView(data: SearchViewData): string {
  return `
    <form class="search-form" action="/search" method="get"
          hx-get="/search" hx-target="#search-results" hx-push-url="true">
      <input type="search" name="q" value="${escapeHtml(data.query)}" placeholder="ノートを検索..." autofocus>
      <button type="submit">検索</button>
    </form>
    <div id="search-results">
      ${searchResultsView(data)}
    </div>`;
}

/** 検索結果部分のみ（HTMX部分更新用） */
export function searchResultsView(data: SearchViewData): string {
  if (!data.query) {
    return '<div class="empty">キーワードを入力して検索してください。</div>';
  }

  if (data.results.length === 0) {
    const confidentialNote = data.excludedConfidential > 0
      ? `<br><span class="meta">（confidentialノート ${data.excludedConfidential}件を除外）</span>`
      : "";
    return `<div class="empty">「${escapeHtml(data.query)}」の検索結果はありません。${confidentialNote}</div>`;
  }

  const items = data.results.map((r) => {
    const warningBadge = r.securityFlag === "suspicious"
      ? ' <span class="badge-warning">suspicious</span>'
      : "";

    return `
    <div class="card">
      <a href="/notes/${encodeURIComponent(r.filePath)}"
         hx-get="/notes/${encodeURIComponent(r.filePath)}"
         hx-target="#main" hx-push-url="true">
        <h3>${escapeHtml(r.title || r.filePath)}${warningBadge}</h3>
        <span class="meta">${r.filePath} &middot; ${formatDate(r.updated)}</span>
      </a>
      <div class="snippet">${escapeHtml(r.snippet)}</div>
    </div>`;
  }).join("");

  const confidentialNote = data.excludedConfidential > 0
    ? `<div class="meta" style="margin-top: 0.5rem;">confidentialノート ${data.excludedConfidential}件を除外</div>`
    : "";

  return `
    <div class="section-title">「${escapeHtml(data.query)}」の検索結果 (${data.results.length}件)</div>
    ${items}
    ${confidentialNote}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}
