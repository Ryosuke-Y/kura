# Kura（蔵）

[English](README.md)

**あなたのMarkdownノートは、エージェントのナレッジベースです。
そのまま渡して大丈夫ですか？**

Kuraは、ローカルLLMを動かしながら使える開発者・リサーチャー向けのナレッジ管理ツールです。プレーンMarkdownで保存し、サニタイズ済みのJSONで返します。

## Kuraがやること

- **プレーンMarkdownで保存** — ロックインなし。vim、VS Code、Obsidianと共存
- **全文検索** — 英語・日本語対応（中国語は対応中）。SQLite FTS5 + 言語別トークナイズ
- **鮮度でランキング** — 時間減衰で新しいノートが上位に、古いノートも消えない
- **渡す前にサニタイズ** — 隠し命令を除去し、インジェクションパターンを検知してからエージェントに渡す

## 使い方

```bash
# 1. フォルダをVaultにする
kura init ~/knowledge

# 2. 検索インデックスを構築
kura index

# 3. エージェントがKuraに問い合わせる
kura search "RAGセキュリティ" --format json
```

3番目のコマンドはこう返します：

```json
{
  "results": [
    {
      "path": "references/rag-security.md",
      "title": "RAGセキュリティ脅威",
      "snippet": "ドキュメントポイズニングによりLLMの出力を操作される...",
      "updated": "2026-03-20T10:00:00+09:00",
      "security_flag": "clean"
    }
  ],
  "meta": { "excluded_confidential": 2 },
  "sanitized": true
}
```

`confidential: true`のノート2件は自動で除外されました。
スニペットは隠し命令がないかスキャン済み。
エージェントには出典付きのクリーンなデータが渡ります。

## ローカルLLMと共存できる軽さ

9Bモデルが5-6GBのRAMを使う環境で、ツールは小さくなければいけません。

```
OS + アプリ            ~10 GB
ローカルLLM (9B Q4)    ~6 GB
残り                   ~16 GB
────────────────────────────
Kura serve              ~80 MB  （Web UI）
Kura CLI (インデックス) ~400 MB  （一時的）
```

比較: Obsidian ~300MB、Notion ~400MB常駐。

## セキュリティ

KuraはVaultをRAGのナレッジベースとして扱います。同じデータ、同じ攻撃面です。

| 脅威 | Kuraの対策 |
|------|-----------|
| ドキュメントポイズニング | `kura audit`でインジェクションパターンをスキャン |
| 隠し命令 | HTMLコメント・ゼロ幅文字を除去 |
| プロンプトインジェクション | "ignore previous instructions"等のパターンを検知 |
| 機密情報漏洩 | `confidential: true`のノートを全出力から除外 |

サニタイズはデフォルトON。詳細は[docs/security.md](docs/security.md)を参照。

## HTTP API

`kura serve`起動中に利用可能：

| エンドポイント | 説明 |
|---------------|------|
| `GET /api/search?q=...` | 全文検索 |
| `GET /api/notes` | ノート一覧 |
| `GET /api/notes/:path` | ノート詳細 |
| `POST /api/audit` | セキュリティスキャン |

## CLI

| コマンド | |
|---------|--|
| `kura init` | Vaultを作成 |
| `kura create` | ノート作成 |
| `kura index` | 検索インデックス構築 |
| `kura search` | 検索（時間減衰ランキング） |
| `kura audit` | セキュリティスキャン |
| `kura daily` | デイリーノート |
| `kura serve` | ブラウザUI（localhost:3847） |
| `kura show`, `edit`, `list` | 表示、編集、一覧 |

## インストール

```bash
git clone https://github.com/Ryosuke-Y/Project-kura.git
cd Project-kura && bun install
bun run kura --help
```

シングルバイナリとしてビルド：

```bash
bun run build    # → ./kura
```

[Bun](https://bun.sh)が必要です。

## 設定

`.kura/config.toml`:

```toml
[search]
decay_rate = 0.01  # 大きいほど古いノートが早く沈む

[serve]
port = 3847
```

## アーキテクチャ

```
src/
├── cli/        # CLI（Commander.js）
├── serve/      # Web UI（Hono + HTMX）+ REST API
├── services/   # ビジネスロジック（全インターフェースで共有）
├── models/     # 型定義
└── utils/      # ユーティリティ
```

**技術スタック:** Bun, SQLite FTS5, kuromoji.js（日本語）, Intl.Segmenter（中国語）, Hono, HTMX

## ライセンス

AGPL-3.0 — [LICENSE](LICENSE)を参照
