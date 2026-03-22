# Kura セキュリティガイド

## 脅威モデル

KuraのVaultは本質的にRAGのナレッジベースです。`kura search --format json`やHTTP API（`/api/search`）の出力がLLMのコンテキストに渡される構造であり、RAGシステムと同じ攻撃面を持ちます。

参考文献:
- PoisonedRAG (USENIX Security 2025)
- ConfusedPilot
- OWASP LLM Top 10 2025

## 脅威と対策

### 1. ドキュメントポイズニング

**攻撃:** Vaultに悪意あるMarkdownが配置され、検索結果を通じてLLMに渡される。

**対策:**
- `kura index`実行時にノート内容を自動スキャン
- 既知のインジェクションパターンを検知 → `security_flag: suspicious` を自動付与
- `kura audit`でVault全体の定期スキャン
- ノート自体は削除しない（誤検知の可能性）

### 2. 間接プロンプトインジェクション

**攻撃:** ノート本文にHTMLコメント、不可視Unicode文字、隠し命令が埋め込まれる。

**対策:**
- `--format json` / HTTP API出力時にサニタイズパイプラインを適用
  - HTMLコメント除去
  - ゼロ幅文字（ZWSP, ZWNJ, ZWJ, Word Joiner, BOM）除去
  - インジェクションパターン検知 → `warnings`フィールドで通知
- デフォルトON。`--no-sanitize` / `?sanitize=false` で明示的に無効化可能

### 3. データ抽出（機密情報漏洩）

**攻撃:** エージェントがKura経由で個人ノートを取得し、LLMの出力に含めてしまう。

**対策:**
- ノートのfrontmatterに `confidential: true` を設定
- 検索結果・API出力からデフォルトで除外
- 除外件数を `excluded_confidential` で通知（エージェントが存在を認識できる）

### 4. ソース検証の欠如

**対策:** JSON出力に以下のソース情報を必須で含める:
- `path` — ファイルパス
- `updated` — 最終更新日時
- `security_flag` — `clean` / `suspicious`
- `sanitized` — サニタイズ適用の有無

## スキャンルール

以下の正規表現パターンを検知します:

| パターン | 検知対象 |
|---------|---------|
| `ignore (all )?previous instructions` | 過去の指示の無視 |
| `system:` | システムプロンプト注入 |
| `IGNORE_PREVIOUS` | 大文字ディレクティブ |
| `you are now` | ロール再割り当て |
| `forget (all\|everything)` | メモリワイプ |
| `<!-- ... -->` | HTMLコメント（隠し命令） |
| ゼロ幅文字 | 不可視Unicode文字 |

## 推奨設定

### 機密ノートの保護

```yaml
---
title: 社内評価メモ
confidential: true
---
```

`confidential: true` のノートは `kura search --format json` および HTTP API から自動除外されます。

### 定期スキャン

```bash
# Vault全体のセキュリティスキャン
kura audit

# スキャン結果はJSON形式でも取得可能
kura audit --format json
```

結果は `.kura/audit.log` にも記録されます。

### サニタイズの無効化（研究・デバッグ用）

```bash
# CLI
kura search "query" --format json --no-sanitize

# HTTP API
curl http://localhost:3847/api/search?q=query&sanitize=false
```

サニタイズを無効化すると、HTMLコメントやゼロ幅文字がそのままLLMに渡されるリスクがあります。研究・デバッグ目的以外では推奨しません。

## 報告

セキュリティ問題を発見した場合は、GitHubのIssueで報告してください。
