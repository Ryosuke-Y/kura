/**
 * テスト共通セットアップ
 *
 * kuromoji辞書のロードはコストが高い（~110ms + 337MBメモリ）ため、
 * テストスイート全体で1回だけ初期化して使い回す。
 */

import kuromoji from "kuromoji";
import path from "path";

const DICT_PATH = path.join(
  import.meta.dir,
  "../node_modules/kuromoji/dict"
);

// 辞書ロード済みのトークナイザーをPromiseで保持
// 複数のテストファイルからimportされても、初回のみロードが走る
let tokenizerPromise: Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> | null = null;

export function getTokenizer(): Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> {
  if (!tokenizerPromise) {
    tokenizerPromise = new Promise((resolve, reject) => {
      kuromoji.builder({ dicPath: DICT_PATH }).build((err, tokenizer) => {
        if (err) reject(err);
        else resolve(tokenizer);
      });
    });
  }
  return tokenizerPromise;
}

/** 検索に有用な品詞のみ残して分かち書きする */
const meaningfulPos = new Set(["名詞", "動詞", "形容詞", "副詞"]);

export function tokenize(
  tokenizer: kuromoji.Tokenizer<kuromoji.IpadicFeatures>,
  text: string
): string {
  return tokenizer
    .tokenize(text)
    .filter((t) => meaningfulPos.has(t.pos))
    .map((t) => t.surface_form)
    .join(" ");
}
