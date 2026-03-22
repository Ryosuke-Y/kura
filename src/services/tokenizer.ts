/**
 * 多言語トークナイザーサービス
 *
 * 言語設定に応じて適切なトークナイザーを使い分ける。
 * - en: パススルー（FTS5 unicode61がそのまま処理）
 * - ja: kuromoji.jsで形態素解析
 * - zh: Intl.Segmenterで中国語分節（外部依存なし）
 *
 * 呼び出し元（indexer.ts, search.ts）は tokenize(text) を呼ぶだけ。
 * 言語の切り替えは initTokenizer(language) で行う。
 */

import kuromoji from "kuromoji";
import path from "path";

/** サポートする言語 */
export type Language = "en" | "ja" | "zh";

/** 現在の言語設定（デフォルトは日本語、後方互換性のため） */
let currentLanguage: Language = "ja";

/**
 * トークナイザーの言語を設定する
 *
 * indexer.ts / search.ts が呼ばれる前に、
 * config.tomlのlanguage設定を元に1回だけ呼ぶ。
 */
export function initTokenizer(language: string): void {
  if (language === "en" || language === "ja" || language === "zh") {
    currentLanguage = language;
  }
}

// =============================================
// 英語トークナイザー
// =============================================

/**
 * 英語テキストをそのまま返す
 *
 * 英語はスペース区切りなのでFTS5のunicode61が直接処理できる。
 * kuromojiの337MBロードが不要になり、メモリと速度を節約。
 */
function tokenizeEnglish(text: string): string {
  return text;
}

// =============================================
// 日本語トークナイザー（kuromoji.js）
// =============================================

/** 検索に有用な品詞（助詞・助動詞・記号を除外） */
const MEANINGFUL_POS = new Set(["名詞", "動詞", "形容詞", "副詞"]);

/** kuromoji シングルトン */
let kuromojiInstance: Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> | null = null;

function getDictPath(): string {
  return path.join(import.meta.dir, "../../node_modules/kuromoji/dict");
}

/** kuromoji.jsのトークナイザーを取得（テスト用にエクスポート） */
export function getTokenizer(): Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> {
  if (!kuromojiInstance) {
    kuromojiInstance = new Promise((resolve, reject) => {
      kuromoji
        .builder({ dicPath: getDictPath() })
        .build((err, tokenizer) => {
          if (err) reject(err);
          else resolve(tokenizer);
        });
    });
  }
  return kuromojiInstance;
}

async function tokenizeJapanese(text: string): Promise<string> {
  const tok = await getTokenizer();
  return tok
    .tokenize(text)
    .filter((t) => MEANINGFUL_POS.has(t.pos))
    .map((t) => t.surface_form)
    .join(" ");
}

// =============================================
// 中国語トークナイザー（Intl.Segmenter）
// =============================================

/** 中国語Segmenter（シングルトン） */
let zhSegmenter: Intl.Segmenter | null = null;

/**
 * Intl.Segmenterで中国語テキストを単語に分節する
 *
 * Bun/V8に組み込みなので外部依存なし。
 * 中英混在テキストも正しく処理する（英語部分はそのまま残る）。
 */
function tokenizeChinese(text: string): string {
  if (!zhSegmenter) {
    zhSegmenter = new Intl.Segmenter("zh", { granularity: "word" });
  }
  return [...zhSegmenter.segment(text)]
    .filter((s) => s.isWordLike)
    .map((s) => s.segment)
    .join(" ");
}

// =============================================
// 統合エントリポイント
// =============================================

/**
 * テキストを検索用にトークナイズする
 *
 * 現在の言語設定に応じて適切なトークナイザーを使う。
 * 呼び出し元は言語を意識する必要がない。
 */
export async function tokenize(text: string): Promise<string> {
  switch (currentLanguage) {
    case "en":
      return tokenizeEnglish(text);
    case "zh":
      return tokenizeChinese(text);
    case "ja":
    default:
      return tokenizeJapanese(text);
  }
}
