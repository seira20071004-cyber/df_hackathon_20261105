# Bridge Work 2.0：機密情報・Secret Manager・閲覧権限の実装報告

2026-11-07。今回の追加実装を記載する。以前の報告書の「Secret Manager未作成」「秘密情報もマスクして送信」という記述は、本書の内容で更新する。クラウドへの登録と、アプリ実行環境での実取得は区別する。

## 1. 発見した問題

|重要度|問題|今回の対策・現状|
|---|---|---|
|High|秘密情報も個人情報と同じくマスク後にAIへ送信していた|認証情報・明示された機密情報は送信前に停止。検査不能時も停止|
|High|Secret Managerはファイル接続口だけで実リソース未作成|開発用の実シークレットと限定IAMを作成。ADCによる取得処理を追加。実行環境の接続は未完了|
|High|マニュアルの公開範囲が組織・現場・公開状態のみ|機密レベル、役割、指定スタッフによるサーバー側認可を追加|
|Medium|公開内容のまま閲覧権限だけを変更する仕組みがなかった|権限保存時に旧公開版を停止し、再承認するまで非公開|
|Medium|閲覧記録の更新と公開状態の検査が別処理だった|現行版・閲覧権限の確認と閲覧・既読記録をトランザクション化|
|Medium|同じブロックでもJSONキーの順序で変更扱いになる|正規化したハッシュで比較。未変更の承認を不要に拒否しない|

従来の認証・組織分離などの監査は `security-audit.md` と `security-implementation.md` を参照。

## 2. 実装した対策

### 実装済み

- Secret Manager REST APIをADCで呼ぶサーバー専用ローダー。固定HTTPS宛先、10秒期限、Base64・CRC32C・リソース名・固定バージョンを検証。Googleのプロジェクト番号への正規化にも対応。
- Secret Manager → 絶対パスのマウントファイル → 開発／明示デモの環境変数、の設定優先順。**設定したSecret Managerの失敗時には別のキーへ退避しない**。本番の直接環境変数キーとlatest参照を拒否する。
- 同時取得をまとめ、30秒キャッシュ。期限切れ後に取得失敗した場合は古い値も返さない。SDKをキー変更に追従させる。Vertex ADCの場合はキー取得自体を省略。
- APIキー、Bearer/JWT、秘密鍵、パスワード形式、明示的な機密情報をローカルで検査。高リスク情報を検出すると、DLP／Geminiに送らず停止。DLPのAUTH_TOKEN／PASSWORD検出でもGeminiに送らない。個人情報はマスク可能。検査不能は自動処理・公開を保留。
- PUBLIC / INTERNAL / CONFIDENTIAL / RESTRICTED。組織・現場を必須とし、スタッフの役割・指定IDをチェック。管理者は担当現場の確認・編集のため閲覧可能。
- PUBLICも同じ組織・現場内の公開であり、インターネット公開ではない。CONFIDENTIALは指定スタッフのみ。RESTRICTEDはスタッフ閲覧・公開・AI再生成を拒否する。
- 一覧、類似検索のAI投入前、検索結果の返却直前、閲覧、送信、利用記録で認可。スタッフ向けレスポンスから指定ユーザーID一覧・根拠・監査情報を除外。
- 管理者画面に機密レベル・役割・スタッフの指定UIを追加。権限保存で旧公開版を停止、版番号と監査履歴を更新、進行中の旧生成を無効化。再承認が必要。
- 既存の4工程生成・構造化JSON・出典検証・管理者承認・A4出力・チャット機能を維持。

### 一部実装／接続待ち

Firebase Auth / Firestoreの本番認証、分散制限、監査永続化、Sensitive Data Protection、App Check、Vertex ADCはコードあり。実クラウドを使った一連の検証は未完了。ローカルのデモ認証はFirebase認証を代替するものではない。

## 3. 使用したGoogle技術

Gemini公式SDK、Vertex AIのADC認証経路、Firebase Authentication、Firestore、Secret Managerを利用する構成。Sensitive Data Protection検査とFirebase App Checkの接続口、Cloud Logging向け構造化ログも既存実装を維持。今回、実クラウドで新規に有効化・設定したのはSecret Managerのみ。

## 4. 今回の変更ファイル

- `lib/server-secrets.ts`（新規）：安全なキー取得・キャッシュ・失敗処理。
- `lib/ai.ts`：テキスト・Embedding・任意画像生成のキー取得を統一。
- `lib/privacy.ts`, `lib/security-content.ts`：送信禁止情報のゲート、モック可能な検査境界。
- `lib/manual-access.ts`（新規）, `lib/model.ts`：機密レベルと閲覧認可。
- `lib/publication.ts`, `lib/storage.ts`, `lib/workflow.ts`：公開ハッシュ、原子的閲覧、送信・検索・利用の認可、権限変更API。
- `lib/manuals.ts`：RESTRICTED停止と安全なエラーコード。
- `app/manual-access-editor.tsx`（新規）, `app/manual.tsx`, `app/page.tsx`, `app/manual-delivery.tsx`：管理者の権限設定、説明、送信先制限。
- `.env.example`：Secret Manager参照設定。
- `tests/secret-access.test.mjs`（新規）, `tests/manual-access-api.mjs`（新規）：モックと隔離API統合テスト。

## 5. Secret Managerの実作成結果と名前

対象プロジェクト：`project-9150e0b5-90d7-49b2-9a7`、番号 `470436791155`。

**作成・検証済み**：`bridge-work-gemini-api-key-dev`。既存の開発用キーをバージョン1へ保存し、Consoleで「有効」を確認した。キーそのものは報告書・コード・ログに出力していない。新しいAPIキーやサービスアカウント鍵は発行していない。

参照：`projects/470436791155/secrets/bridge-work-gemini-api-key-dev/versions/1`。

本番でDeveloper APIキーが必要な場合の名前：`bridge-work-gemini-api-key-prod`。**未作成**。開発キーを本番へ複製していない。本番をVertex ADCで運用するならGemini APIキーのシークレットは不要。

Consoleの作成とIAM付与まで実施済みであり、Cloud Runからの取得・マウントは未設定。現在のローカルプレビューは既存の無視対象 `.env.local` を維持している。ADC未設定のローカルをSecret Manager参照へ切り替えて動作不能にする変更はしていない。

## 6. Google Cloud IAM

**実際に付与済み**：既存の `bridge-work-gemini@project-9150e0b5-90d7-49b2-9a7.iam.gserviceaccount.com` に、開発用シークレット1件のリソース上で `roles/secretmanager.secretAccessor` を付与。Consoleで「継承されていません」を確認。プロジェクト全体のAccessor、Secret Manager管理者、鍵作成権限は追加していない。既存のプロジェクト所有者の継承権限は維持。

本番では開発と異なる実行アカウントを使い、必要な本番シークレット1件だけを許可する。Firestore、DLP、Vertexなど各サービスの実行権限は必要な利用範囲に絞って別途設定・検証する。今回、これらの追加IAMは変更していない。

## 7. 環境変数

推奨するVertex本番構成：

```dotenv
BRIDGE_DEMO=false
GEMINI_PROVIDER=vertex
GEMINI_VERTEX_AUTH=adc
GOOGLE_CLOUD_PROJECT=YOUR_PRODUCTION_PROJECT
FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT
BRIDGE_SENSITIVE_PROVIDER=google-dlp
BRIDGE_DLP_PROJECT=YOUR_INSPECTION_PROJECT
BRIDGE_PRIVACY_STRICT=true
```

Developer APIを使う本番では `GEMINI_PROVIDER=developer` とし、`GEMINI_API_KEY_SECRET=projects/PROJECT_NUMBER/secrets/bridge-work-gemini-api-key-prod/versions/1` を指定する。代わりにCloud Runでマウントした絶対パスを `GEMINI_API_KEY_FILE` に設定してもよい。秘密値を環境変数やNEXT_PUBLIC変数に書かない。モデルは既存 `GEMINI_MODEL` / `GEMINI_REVIEW_MODEL` で変更可能。

App Checkの公開識別子・強制設定とレート制限は `.env.example` / `app-check-setup.md` を参照。Firebase Web APIキーは公開設定であり、Gemini秘密キーと共用しない。

ローテーション：新キーを管理者が発行→同じシークレットに新バージョン→新しい番号を設定して新リビジョンへデプロイ→疎通確認→旧キーの無効化。新バージョンを追加するだけでは固定番号は変わらない。通知スケジュールはキーを自動更新する機能ではない。今回、既存キーの失効・ローテーションは実行していない。

## 8. Firebase Security Rules

既存のFirestore / Storageのクライアント全拒否を維持し、今回の緩和はなし。認証済みサーバーAPI経由のみ。Admin SDKはRulesをバイパスするため、組織・現場・機密レベルの制御をサーバーで必須にする。RulesがAdmin SDKのバグまで防ぐわけではない。実環境へのRules反映とEmulator Suiteのルール検証は未実施。

## 9. テスト結果

- TypeScript：`npm run check` 成功。
- 純粋処理／モック／バンドル検査：40件成功（`secret-access`, `security`, `interactive-generation`, `app-check-client`, `manual-context`, `diagrams`, `manual-assets`, `semantic-search`）。
- 最新ソースの隔離dev API統合：`node --test tests/manual-access-api.mjs` 1件成功。独立JSONデータと無効なAI設定で起動し、実ユーザーデータや有料APIを使わず、権限変更・再承認・検索・送信・閲覧・利用開始・RESTRICTEDを連続検証。
- ローカルdev APIの読み取り中心スモーク：5件成功。
- `npm audit --omit=dev --audit-level=high`：0件。
- Git全参照の履歴中の188ファイルオブジェクトを検査。現在設定中のキーの完全一致0件、代表的なGoogle/GitHubキー・秘密鍵形式0件。未知の形式やチャット中の露出まで保証する検査ではない。
- ブラウザーで管理者画面の機密レベルとスタッフ選択の表示を確認。画面確認だけでは既存データの権限を変更していない。
- 本番ビルド：コンパイルとTypeScript検査は成功。静的ページ生成時、Windowsが `.next/server/app/_not-found.segments/_not-found` のmkdirをEPERMで拒否して失敗。本番ビルド完了・本番起動・既存production APIテスト一式の最新ソースでの成功は報告しない。

## 10. 未実装・未検証

Secret Managerの実行環境接続、本番Firebase/Firestore/DLP/Vertex/App Checkの実接続テスト、Cloud Loggingのシンク・保持期間・閲覧権限、Firebase EmulatorによるRules検証、本番用別アカウント・キー、高度監視・MFA・削除ポリシー、自動ローテーション、画像OCR検査、全過去版の復元UIは未完了。

## 11. 残存リスク

ローカル検査だけでは氏名・暗黙の営業秘密・独自形式の認証情報を検出しきれない。本番では検査サービスが必要。画像検査は未実装のため厳格モードの画像付き公開を保留する。検出済みの秘密情報も、管理者と本人が扱う元チャットには保持されるため、AI送信停止は保存データの削除を意味しない。

未分類の既存マニュアルは従来の動作を維持するためINTERNALを既定にする。本番では公開ハッシュに閲覧ポリシーが加わったため、旧ハッシュのマニュアルは再検査・再承認まで配信されない。自動移行・再公開は行っていない。権限の失効は以降の要求に適用し、すでに利用者の端末へ渡ったPDFや本文は回収できない。

このチャットに過去APIキーが貼られている。Secret Managerへの保管は、過去の露出を取り消さない。現在有効なキーの棚卸し・交換は別途必要。履歴の書き換えや認証情報の無断失効はしていない。

## 12. デプロイ時の作業

1. 書き込みエラーのないビルド環境で本番ビルドとproduction APIテストを完了する。
2. 本番Firebaseプロジェクト、プロフィールとメンバー管理、全拒否Rules、サーバー実行IAMを設定・検証する。デモ認証を無効にする。
3. Vertex ADCを使うか、別の本番キーとSecret Managerを使うか選び、実行アカウントをアタッチして実際の取得・生成・検査を確認する。サービスアカウントJSON鍵を配布しない。
4. Sensitive Data Protectionを有効化・権限設定し、検査失敗時に停止する実接続テストを行う。
5. App Checkを登録ドメインで検証してから強制する。実トークンがない段階で強制して全利用者を締め出さない。
6. 既存マニュアルの機密レベルを管理者が確認して再承認し、ログ保持・コスト・バックアップを決める。

GitHub連携はこれまでの書き込みで403となっている。ローカルコミットと配布用ZIPを用意し、成功が確認できない限りGitHub反映済みとは扱わない。

公式資料：[Secret Managerバージョン取得・CRC32C検証](https://docs.cloud.google.com/secret-manager/docs/access-secret-version)、[IAMによるアクセス制御](https://docs.cloud.google.com/secret-manager/docs/access-control)、[Cloud Runでのシークレット利用](https://docs.cloud.google.com/run/docs/configuring/services/secrets)。
