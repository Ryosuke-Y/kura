/**
 * kuromoji.js トークナイザーサービス
 *
 * 辞書ロードのコストが高い（337MBメモリ）ため、
 * シングルトンパターンで1プロセスにつき1回だけロードする。
 *
 * メモリ戦略（対策A）:
 * - CLI実行時: プロセス開始時にロード → コマンド完了後にプロセス終了で解放
 * - kura serve時: 将来的に遅延ロードまたは子プロセス化を検討
 */

import kuromoji from "kuromoji";
import path from "path";

/** 検索に有用な品詞（助詞・助動詞・記号を除外） */
const MEANINGFUL_POS = new Set(["名詞", "動詞", "形容詞", "副詞"]);

/** シングルトンのPromiseを保持 */
let tokenizerInstance: Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> | null =
  null;

/** kuromoji辞書のパスを解決する */
function getDictPath(): string {
  // import.meta.dirはこのファイルのディレクトリ
  // node_modules/kuromoji/dict へのパスを組み立てる
  return path.join(import.meta.dir, "../../node_modules/kuromoji/dict");
}

/** トークナイザーを取得（初回のみ辞書ロード） */
export function getTokenizer(): Promise<
  kuromoji.Tokenizer<kuromoji.IpadicFeatures>
> {
  if (!tokenizerInstance) {
    tokenizerInstance = new Promise((resolve, reject) => {
      kuromoji
        .builder({ dicPath: getDictPath() })
        .build((err, tokenizer) => {
          if (err) reject(err);
          else resolve(tokenizer);
        });
    });
  }
  return tokenizerInstance;
}

/**
 * テキストを検索用に分かち書きする
 *
 * 助詞・助動詞・記号を除外し、名詞・動詞・形容詞・副詞のみ残す。
 * 結果はスペース区切りの文字列で、FTS5のunicode61トークナイザーが
 * そのまま単語として認識できる形式。
 */
export async function tokenize(text: string): Promise<string> {
  const tok = await getTokenizer();
  return tok
    .tokenize(text)
    .filter((t) => MEANINGFUL_POS.has(t.pos))
    .map((t) => t.surface_form)
    .join(" ");
}
