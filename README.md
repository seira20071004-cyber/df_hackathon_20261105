# Bridge Work

外国人スタッフの「困った」を、職場全体の「わかる」に変える AI。清掃業の架空現場を使い、相談から解決、ナレッジの承認、図解マニュアルの公開までを体験できます。

## ローカル起動

Node.js 22 以降を使用します。

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開きます。初期設定では架空のスタッフ2名と管理者でログインでき、データは `.bridge-work/data.json` に保存されます。デモ環境は信頼できるローカル環境で起動してください。データを初期化するには、停止後にこのファイルを削除します。

## Firebase と Gemini の設定

| 変数 | 用途 |
| --- | --- |
| `BRIDGE_DEMO` | `true` で架空データとデモアカウントを利用。Firebase 利用時は `false` |
| `FIREBASE_PROJECT_ID` | Firebase プロジェクト ID |
| `FIREBASE_WEB_API_KEY` | Firebase Authentication の Web API キー |
| `GOOGLE_APPLICATION_CREDENTIALS` | ローカル ADC にサービスアカウントを使用する場合の JSON ファイルの絶対パス。Google Cloud の実行環境では、権限を設定した実行用サービスアカウントを利用可能 |
| `GEMINI_API_KEY` | サーバーが Gemini API を呼び出すキー |
| `GEMINI_MODEL` | Gemini モデル名。既定値は `gemini-2.5-flash` |

1. Firebase で Cloud Firestore を作成し、Authentication のメール／パスワード認証を有効にします。Firebase Authentication に従業員と管理者を作成します。
2. Firestore の `users/{Firebase Auth UID}` に各アカウントのプロフィールを作成します。例は `{"name":"Linh Nguyễn","role":"employee","preferredLanguage":"vi","organizationId":"company","siteIds":["sakura"]}` です。管理者の `role` は `manager`、対応言語は `ja`、`en`、`vi` です。組織・現場の割り当ては Firebase 管理者が設定します。
3. サーバーに Firebase Admin SDK 用の ADC を設定します。サービスアカウントには Firestore の読み書きと Firebase Auth のユーザー状態確認権限を付与します。設定ファイルやキーは Git 管理外に保管します。
4. Firebase CLI で `firebase deploy --only firestore:rules --project <project-id>` を実行します。ブラウザから Firestore へは直接アクセスせず、サーバーが Firebase ID トークン、役割、組織、現場、所有者を検証します。相談・マニュアルは `organizations/{organizationId}/sites/{siteId}` 配下に分離し、チャットは相談と同じドキュメントで更新します。
5. `.env.local` の Firebase 設定を記入して `BRIDGE_DEMO=false` に変更し、Gemini を使う場合はキーも追加して再起動します。Firebase モードでは架空のデータを自動投入しません。

Gemini を有効にすると翻訳、要約、マニュアルの意味検索、会話からのマニュアル生成、確認時の英語・ベトナム語訳が動作します。検索対象は同じ現場の確認済みマニュアルです。スタッフが質問時に候補の適合性を確認して開くと、そのスタッフのマニュアル一覧に残ります。API エラー時は元のメッセージを表示し、検索は作業カテゴリと文字の類似度で続行します。キーなしのデモでは定型の質問・回答に参考訳が付き、自由文の翻訳には Gemini キーが必要です。

実装参照 [Firebase ID トークンの検証](https://firebase.google.com/docs/auth/admin/verify-id-tokens) · [Gemini 構造化出力](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)

## 発表用の操作

1. **Linh Nguyễn** でログインし、`Tôi cần dọn cầu thang từ tầng nào đến tầng nào?` を入力して検索します。候補から階段清掃の図解を開きます。
2. ホームに戻り、管理者に相談します。別のブラウザプロファイルかプライベートウィンドウで **佐藤 美咲** を開き、相談履歴を更新します。
3. 日本語訳と原文を確認し、`このデモ現場では、1階から3階までの階段と踊り場が対象です。` と返信します。Linh 側で更新するとベトナム語の参考訳を確認できます。
4. Linh 側で **Đã giải quyết** を押します。会話からマニュアルが作られ、佐藤側の **マニュアル → 未確認** に表示されます。Gemini キーなしの場合は、管理者の回答から確認用の内容を作ります。
5. 内容を確認・編集し、確認欄を選択して **確認済にする** を押します。
6. **Alex Smith** で同じテーマを検索します。該当候補で **Yes, open the guide** を選ぶと図解が開き、Alex のマニュアル一覧に残ります。

## 検証

```powershell
npm run build
npm run check
npm test
```

API の統合テストは、分離された一時データで本番ビルドを起動します。ベトナム語の相談・返信、解決時の自動生成、未確認マニュアルの閲覧制限、確認済みマニュアルの検索、スタッフ本人の閲覧履歴と自己解決を検証します。Firebase と Gemini の実サービスの検証には、上記の設定とアカウントが必要です。

対応ブラウザでは、マイクの使用を許可すると音声入力を利用できます。認識処理はブラウザが担当し、アプリには文字起こし結果が渡ります。写真添付と Firebase Storage へのアップロードは今後の機能です。

マニュアルは質問内容、対処法、会話中に明記された注意事項を表示します。Gemini が利用できる場合、`GEMINI_IMAGE_MODEL`（既定値 `gemini-2.5-flash-image`）で対処法のイラストを生成します。生成できなかった場合も対処法の文章を表示します。
