# Kura（蔵）— 仕様書

> *蔵 (kura)* — 日本語で「蔵」。知識を静かに守る、軽量なストアハウス。

## コンセプト

Electron不要・常駐プロセスなしの、ローカルLLM時代に最適化されたKnowledge Managementツール。
CLI-first設計で、必要なときだけブラウザUIを起動する。プレーンMarkdownベースで特定ツールにロックインされない。

## コアバリュー

- **超軽量**: Web UI常駐時50〜80MB、CLI実行時一時400MB以下。Electronアプリと比べ常駐メモリ1/5〜1/10
- **ローカルLLM共存**: Qwen3.5 9B + Kura が M5 MacBook Air 32GB で快適に同居
- **ツール非依存**: プレーンMarkdown + YAML frontmatter。Obsidian, VS Code, vim、何でも編集可能
- **エージェント対応**: `--format json` で任意のLLM/エージェントから利用可能
- **プロトコル非依存**: CLI/HTTP APIが第一級。MCP等は後付けアダプタ
- **エージェント時代のセキュリティ**: ドキュメントポイズニング・間接プロンプトインジェクション対策を初期設計から組み込み

---

## ターゲット環境

| 項目 | スペック |
|------|---------|
| 基準マシン | M5 MacBook Air 32GB |
| ローカルLLM | Qwen3.5 9B（Q4_K_M, ~5-6GB） |
| OS | macOS（将来的にLinux/Windows対応） |
| Kuraメモリバジェット | serve常駐時50-80MB、CLI実行時一時400MB以下、非実行時ゼロ |

---

## ノートフォーマット

```markdown
---
title: プロジェクト計画
tags: [project, planning]
created: 2026-03-15T10:00:00+09:00
updated: 2026-03-15T14:30:00+09:00
confidential: false              # true: エージェント経由の検索結果から除外
security_flag: clean             # clean | suspicious（自動スキャン結果）
---

ノートの本文がここに入る。
プレーンMarkdownで、特殊な記法は不要。
```

---

## Vault ディレクトリ構造

```
~/knowledge/          ← Kura Vault（任意の場所）
├── .kura/
│   ├── config.toml   ← Vault設定
│   ├── index.db      ← SQLite FTS5インデックス（再構築可能）
│   └── templates/    ← デイリーノート等のテンプレート
├── daily/
│   ├── 2026-03-15.md
│   └── 2026-03-16.md
├── projects/
│   └── kura-development.md
├── references/
│   └── generative-retrieval.md
└── inbox/
    └── quick-note.md
```

---

## CLIコマンド体系

### 初期化

```bash
kura init                          # カレントディレクトリにVaultを作成
kura init ~/knowledge              # 指定パスにVaultを作成
```

### ノート操作

```bash
kura create "タイトル"              # 新規ノート作成（$EDITORで開く）
kura create "タイトル" --dir inbox  # 指定ディレクトリに作成
kura edit <id or path>             # 既存ノートを$EDITORで開く
kura show <id or path>             # ノート内容を表示
kura list                          # ノート一覧
kura list --dir projects           # ディレクトリでフィルタ
```

### 検索

```bash
kura search "クエリ"               # 全文検索
kura search "クエリ" --limit 10    # 件数指定
kura search "クエリ" --format json # JSON出力（エージェント連携用、サニタイズ自動適用）
kura search "クエリ" --format json --no-sanitize  # サニタイズ無効（自己責任）
kura search "クエリ" --include-confidential        # confidentialノートも含める（人間用）
```

### タグ

```bash
kura tags                          # タグ一覧と件数
kura tags --filter project         # タグでフィルタしたノート一覧
```

### デイリーノート

```bash
kura daily                         # 今日のデイリーノート作成/開く
kura daily --date 2026-03-14       # 指定日のデイリーノートを開く
kura daily --list                  # デイリーノート一覧
```

### インデックス・セキュリティ

```bash
kura index                         # FTS5インデックス再構築（セキュリティスキャン含む）
kura index --status                # インデックスの状態確認
kura index --skip-scan             # セキュリティスキャンをスキップ（高速再構築）
kura audit                         # Vault全体のセキュリティスキャン
kura audit --fix                   # 疑わしいノートにsecurity_flagを自動付与
kura audit --report                # スキャン結果レポートを出力
```

### Web UI・設定

```bash
kura serve                         # ブラウザUIを起動（localhost:3847）
kura serve --port 4000             # ポート指定
kura config                        # 現在の設定を表示
kura config set daily.auto_create false  # 設定変更
```

### エージェント連携出力例

```json
{
  "results": [
    {
      "path": "references/generative-retrieval.md",
      "title": "Generative Retrieval研究ノート",
      "snippet": "DSI/DSI++の応用領域として...",
      "updated": "2026-03-10T09:00:00+09:00",
      "security_flag": "clean",
      "confidential": false
    }
  ],
  "sanitized": true,
  "excluded_confidential": 2
}
```

---

## 設定ファイル（`.kura/config.toml`）

```toml
[vault]
name = "main"
language = "ja"  # 日本語トークナイザー有効化

[daily]
template = "templates/daily.md"
directory = "daily"
auto_create = true

[search]
tokenizer = "kuromoji"  # "kuromoji" | "budoux" | "trigram" | "unicode61"

[serve]
port = 3847
open_browser = true

[security]
sanitize_agent_output = true
scan_on_index = true
exclude_confidential_from_agent = true
warn_on_suspicious = true
```

---

## ブラウザUI画面構成

1. **ダッシュボード** — 最近のノート、今日のデイリーノート、検索バー
2. **ノート一覧** — ディレクトリ/タグでフィルタ可能なリスト
3. **ノート閲覧/編集** — Markdownエディタ + プレビュー
4. **検索結果** — ハイライト付きの全文検索結果

---

## 競合比較

| ツール | Kuraとの違い |
|--------|-------------|
| Obsidian | Electron（~300MB RAM）、独自プラグインエコシステム |
| Notion | Electron（~400MB RAM）、クラウド依存、独自フォーマット |
| Logseq | Electron（~300MB RAM）、アウトライナー特化 |
| nb (CLI) | Bashベース、ブラウザUIなし、日本語検索未対応 |
| **Kura** | **非Electron、50-80MB、CLI+ブラウザUI、日本語対応、エージェント連携+サニタイズ** |
