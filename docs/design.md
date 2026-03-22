# Kura（蔵）— 設計書

## アーキテクチャ（Plan B: レイヤード）

```
src/
├── cli/
│   ├── index.ts          # エントリポイント、Commander.js設定
│   └── commands/         # 各コマンドのハンドラ（CLIの入出力のみ担当）
│       ├── init.ts
│       ├── create.ts
│       ├── edit.ts
│       ├── show.ts
│       ├── list.ts
│       ├── search.ts
│       └── index-cmd.ts  # "index"はJS予約語に近いため
├── services/             # ビジネスロジック（CLIにもWeb UIにも依存しない）
│   ├── vault.ts          # Vault管理（初期化、設定読み込み）
│   ├── note.ts           # ノートCRUD
│   ├── indexer.ts        # FTS5インデックス構築（kuromojiでトークナイズ→FTS5登録）
│   ├── search.ts         # 検索ロジック（クエリのトークナイズ→FTS5 MATCH）
│   └── tokenizer.ts      # kuromoji.jsラッパー
├── models/
│   └── note.ts           # ノートの型定義（Frontmatter, Note）
└── utils/
    └── frontmatter.ts    # YAML frontmatterパーサー
```

### レイヤーの責務

| レイヤー | 責務 | 依存先 |
|---------|------|--------|
| cli/ | ユーザー入出力、引数解析、表示フォーマット | services/ |
| services/ | ビジネスロジック、データ操作 | models/, utils/ |
| models/ | 型定義、データ構造 | なし |
| utils/ | 汎用ユーティリティ | なし |

**重要な制約:** services/ は cli/ に依存しない。これにより Phase 2 の Web UI（Hono）から同じサービス層を再利用できる。

---

## 技術スタック

| レイヤー | 技術 | 選定理由 |
|----------|------|----------|
| ランタイム | Bun | 組み込みSQLite、シングルバイナリ配布、高速起動 |
| CLI | Commander.js or Bun built-in | 軽量、TypeScript native |
| Web UI | Hono + HTMX | localhost軽量サーバー、Bun内で完結、React不要 |
| DB/検索 | SQLite FTS5 (Bun built-in) | 外部依存ゼロ、十分な性能 |
| 日本語トークナイズ | kuromoji.js | JS内完結、形態素解析→分かち書き→FTS5登録（POCでBudouxは検索用途に不向きと判明） |
| ストレージ | プレーンMarkdown + YAML frontmatter | ロックインなし、git管理可能 |
| メタデータ | `.kura/` ディレクトリ内のSQLite | 再構築可能、`.gitignore`推奨 |

### TypeScriptを選択した理由

1. CLIとブラウザUIを同一言語で開発可能
2. BunのSQLite組み込みにより外部依存を最小化
3. `bun build --compile` でシングルバイナリ配布が可能
4. LLM（Claude Code等）が最も得意なスタックの一つ
5. パフォーマンスがボトルネックになった場合のみRust検討

---

## 日本語全文検索の設計

### 課題

FTS5のデフォルトunicode61トークナイザーはCJK非対応。日本語はスペース区切りがないため、文全体が1トークンになってしまう。

### 解決策: JavaScript側トークナイズ方式

```
[Markdownファイル]
    ↓
[kuromoji.js で形態素解析・分かち書き]
    ↓  "知識 管理 ツール が 軽量 で ある"
[分かち書きテキストをFTS5に登録]
    ↓
[検索クエリも同様にトークナイズしてからMATCH]
```

- FTS5側は標準unicode61トークナイザーで動作（分かち書き済みテキストはスペース区切り）
- 外部ネイティブ依存なし
- kuromoji.js辞書ロード: 約20-30MB追加

### POC比較結果と選定

| 方式 | メリット | デメリット | POC結果 |
|------|---------|-----------|---------|
| **kuromoji.js** | 高精度な形態素解析 | 辞書メモリ337MB | **採用**: ロード112ms、検索精度良好 |
| Budoux | 軽量（1MB）、ロード1ms | フレーズ単位の分割で検索に不向き | **不採用**: 「知識管理ツールは」が1チャンク |
| FTS5 trigram | 実装最小、辞書不要 | 検索精度が粗い、インデックスサイズ大 | 未検証（kuromojiで十分） |
| lindera-sqlite (Rust) | 高精度、メモリ効率 | ネイティブビルド依存 | 将来候補（メモリ改善時） |

---

## セキュリティ設計

### 脅威モデル

KuraのVault = RAGのナレッジベース。`kura search --format json`の出力がLLMのコンテキストに渡される構造であり、RAGシステムと本質的に同じ攻撃面を持つ。

参考: PoisonedRAG（USENIX Security 2025）、ConfusedPilot、OWASP LLM Top 10 2025

### 脅威と対策

#### ①ドキュメントポイズニング

Vaultに悪意あるMarkdownが配置され、`kura search`でLLMに渡されるケース。

**対策:** `kura index`実行時にノート内容の自動スキャン。既知のインジェクションパターン検知→`security_flag: suspicious`を自動付与。`kura audit`でVault全体の定期スキャン。

#### ②間接プロンプトインジェクション

ノート本文にHTMLコメント、不可視Unicode文字、Markdown記法を悪用した隠し命令が埋め込まれるケース。

**対策:** `--format json`出力時にサニタイズパイプラインを適用。HTMLコメント除去、ゼロ幅文字除去、インジェクションパターン検知・警告。デフォルトON、`--no-sanitize`で明示的に無効化可能。

#### ③データ抽出（機密情報漏洩）

エージェントがKura経由で個人的なノートを取得し、LLMの出力に含めてしまうケース。

**対策:** `confidential: true`フラグで機密ノート指定。`--format json`出力時はデフォルトで除外。除外件数は`excluded_confidential`で通知。

#### ④ソース検証の欠如

**対策:** JSON出力スキーマにソース情報（ファイルパス、最終更新日時、security_flag）を必須フィールドとして含める。

### サニタイズパイプライン

```
[kura search --format json 実行]
    ↓
[FTS5検索 → 結果取得]
    ↓
[confidentialフィルタ: confidential: true を除外]
    ↓
[コンテンツサニタイズ]
  - HTMLコメント除去
  - ゼロ幅文字除去
  - インジェクションパターン検知 → 警告フラグ付与
    ↓
[ソース情報付与: path, updated, security_flag]
    ↓
[JSON出力（sanitized: true）]
```

### スキャンルール

```
対象パターン（正規表現）:
- /ignore\s+(all\s+)?previous\s+instructions/i
- /system\s*:\s*/i
- /IGNORE_PREVIOUS/
- /you\s+are\s+now\s+/i
- /forget\s+(all|everything)/i
- /<!--[\s\S]*?-->/                    # HTMLコメント
- /[\u200b\u200c\u200d\u2060\ufeff]/   # ゼロ幅文字

検知時の動作:
- frontmatterに security_flag: suspicious を付与
- .kura/audit.log に記録
- kura search --format json 時に warning フィールドで通知
- ノート自体は削除しない（誤検知の可能性があるため）
```

---

## 設計判断の記録

### 採用した判断

| 判断 | 理由 |
|------|------|
| Electron不使用 | メモリ効率がコアバリュー |
| CLI-first | ターゲットユーザー（開発者・リサーチャー）にとって自然 |
| プレーンMarkdown | ロックイン回避、既存Vault移行コストゼロ |
| Bun + TypeScript | CLI/UIの統一言語、組み込みSQLite、シングルバイナリ |
| JS側トークナイズ | ネイティブ依存なし、配布時の問題回避 |
| FTS5 | 個人KMの規模（数千〜数万件）では十分な性能 |
| 常駐プロセスなし | メモリゼロ目標、必要時のみ起動 |
| HTMX | 最小JS、Reactの重さを避ける |
| セキュリティPhase 1組み込み | エージェント連携 = RAGと同等の攻撃面。後付けでは防御が困難 |
| サニタイズデフォルトON | セキュリティはopt-outであるべき |

### 見送った判断

| 判断 | 理由 |
|------|------|
| Generative Retrieval | 個人KMの規模ではFTS5で十分 |
| MCP前提設計 | 過渡期技術、CLI/HTTP APIで十分 |
| Rust初期実装 | 開発速度を優先 |
| Semantic Search (Phase 1) | FTS5で始め、ニーズが確認できてから追加 |

### 将来検討

| 項目 | トリガー条件 |
|------|-------------|
| セマンティック検索 | FTS5の検索精度に不満が出たとき |
| Rust書き直し | 起動速度やメモリが問題になったとき |
| MCP対応 | エコシステムが安定し、要望があったとき |
| MLベースインジェクション検知 | 正規表現で検知できない攻撃が報告されたとき |

---

## 情報の有効性と時間減衰ランキング

### 研究的背景

エージェントがナレッジベースを検索する際、**情報の鮮度（freshness）**は検索品質に直結する。
関連する研究・概念：

| 研究/概念 | 要点 | Kuraへの示唆 |
|-----------|------|-------------|
| TempRALM (2024) | 時間的文脈を考慮したRAGで回答精度が向上 | 検索ランキングに時間情報を加味する価値がある |
| ExpeL (2024) | LLMが経験から教訓を蒸留し再利用 | 将来的に「蒸留された教訓（lessons）」レイヤーの参考に |
| PTKB (Personal Text Knowledge Base) | 個人的知識は時間とともに変化する | 静的なBM25だけでは個人KMに不十分 |
| Adaptive Lens | パッシブシグナル（ユーザー行動の自動収集）で文脈理解 | 手動ステータス管理は破綻する。自動シグナルを優先すべき |

### 核心的な問い

> エージェントに人間の直感（情報の鮮度を見抜く力）を持たせられるか？

人間は無意識に「3年前のメモ vs 昨日のメモ」を重み付けして判断するが、BM25はテキストの一致度しか見ない。
この問いに対する第一歩として、**updatedタイムスタンプの時間減衰**をBM25スコアに加味する。

### 現在の実装: 時間減衰ランキング

**方式:** BM25スコアに鮮度ブースト係数を掛ける

```
final_score = bm25_score * freshness_boost
freshness_boost = 1.0 / (1.0 + decay_rate * days_since_update)
```

- `decay_rate = 0.01`（デフォルト）
- BM25スコアは負値（小さいほど関連度が高い）なので、freshness_boostを掛けると：
  - 新しいノート → ブースト大 → スコアがより負に → 上位
  - 古いノート → ブースト小 → スコアが0に近づく → 下位

**減衰カーブ（decay_rate = 0.01）:**

| 経過日数 | freshness_boost | 意味 |
|---------|----------------|------|
| 0日 | 1.00 | スコアそのまま |
| 30日 | 0.77 | 23%減衰 |
| 90日 | 0.53 | 47%減衰 |
| 180日 | 0.36 | 64%減衰 |
| 365日 | 0.21 | 79%減衰 |

**なぜ逆比例型 `1/(1+r*t)` を選んだか:**
- Adaptive Lensの指数関数減衰（半減期14日）は検索ランキングには急すぎる
- 逆比例型は緩やかに減衰し、古いノートも完全にゼロにはならない
- decay_rateは将来的にconfig.tomlで調整可能にする

### 時間減衰の限界（認識済み）

一律の時間減衰には本質的な限界がある：

1. **時間が経っても重要なもの**（設計原則、根本的な知見）が埋もれる
2. **時間が経って重要になるもの**（予測が当たったメモ、後から参照されるアイデア）を検出できない
3. **更新頻度バイアス**: 頻繁に編集されるノートが過度に優遇される

### 将来構想: validity_signals と lessons

時間減衰の限界を克服するための発展方向：

#### validity_signals（情報の有効性シグナル）

```yaml
# 将来のfrontmatter拡張案
validity:
  half_life: 365        # この情報の半減期（日）。設計原則なら長い
  superseded_by: null    # この情報を置き換えた新しいノートへの参照
  confidence: high       # 著者の確信度
```

- ノートごとに異なる減衰速度を設定可能にする
- `superseded_by`で情報の新旧関係を明示（古いノートの自動降格）
- パッシブシグナル（参照頻度、引用関係）も将来的に加味

#### lessons（蒸留された教訓）

ExpeLの知見を応用し、複数のノートから蒸留された「教訓」を別レイヤーで管理する構想。
教訓は時間減衰の影響を受けにくく、長期的な知識として機能する。

---

## メモリバジェット（POC実測に基づく改訂版）

### kuromoji辞書のメモリ影響

POCでkuromoji.jsのIPA辞書がメモリ展開後に約337MBを消費することが判明。
当初の「実行時50-80MB」目標は現実と合わないため、利用パターン別に目標を再定義する。

### 利用パターン別メモリ目標

| パターン | メモリ目標 | 根拠 |
|---------|-----------|------|
| 非実行時 | 0MB | 常駐プロセスなし（CLIツール） |
| CLI実行時（`kura search`, `kura index`） | 一時的に400MB以下 | kuromoji辞書337MB + 動作メモリ。コマンド完了後に解放 |
| `kura serve` 常駐時 | 50-80MB以下 | **辞書は非常駐**。検索時のみ遅延ロードまたは子プロセスで対応 |

### メモリ戦略: インデックス時のみkuromoji（対策A）

```
[kura index 実行]
  → kuromoji辞書ロード（337MB、一時的）
  → 全ノートを分かち書き → FTS5に登録
  → プロセス終了 → メモリ解放

[kura search "クエリ"]
  → kuromoji辞書ロード（337MB、一時的）
  → クエリのみトークナイズ → FTS5でMATCH
  → 結果表示 → プロセス終了 → メモリ解放

[kura serve]（常駐）
  → 起動時は辞書非ロード（50-80MB）
  → 検索リクエスト時: 遅延ロードまたは子プロセスでトークナイズ
  → 将来課題: メモリ効率が問題になったらlindera等に切り替え
```

### 32GB RAMでの余裕度

```
macOS常駐         :  4-5 GB
Qwen3.5 9B (Q4)  :  5-6 GB
ブラウザ          :  3-5 GB
その他アプリ      :  2-3 GB
─────────────────────────
残り             : 13-18 GB

Kura CLI実行時   :  ~400 MB（一時的、残りの2-3%）
Kura serve常駐時 :   ~80 MB（残りの0.5%以下）
```
