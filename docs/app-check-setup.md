# App Check 接続手順と今回の追加検証

2026-11-07。ブラウザ側のFirebase公式SDK連携を追加した。クラウドの登録・有効化・課金・IAM・実トークンでの検証はまだ実施していない。

## 実装した動作

1. ブラウザの起動時と認証済みリクエストは、同じ公開設定を一度だけ取得する。
2. App Checkが無効ならFirebaseの検証SDKを読み込まず、既存デモの動作を維持する。
3. 有効な設定がある場合だけ、Firebase公式SDKの `ReCaptchaEnterpriseProvider` でApp Checkを初期化し、SDKの自動更新を有効にする。
4. ログイン・一覧取得・相談・編集・承認等のAPIリクエストへ `X-Firebase-AppCheck` を付与する。
5. 設定不足、SDK/通信失敗、取得タイムアウト時は保護対象のリクエストを送らない。秘密情報を含むSDKの生エラーは表示しない。
6. サーバーが操作を開始する前に `app-check-invalid` を返した場合だけ、トークンを更新して1回再送する。認可・レート制限・サーバーエラーでは変更操作を再送しない。
7. バックエンドは署名等の検証をFirebase Admin SDKに委ね、許可アプリIDと照合する。検証は8秒で打ち切り、内部エラーを返さない。
8. CSPはNext.jsの `proxy.ts` で実行時の設定から生成する。ビルド後にCloud Runの環境変数を設定しても公開設定とCSPが食い違わないようにする。外部接続先はApp Checkが設定済みの場合だけ追加し、第三者によるフレーム埋め込みは引き続き拒否する。

[Firebase公式：reCAPTCHA Enterprise](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider) / [カスタムバックエンドへのトークン送信](https://firebase.google.com/docs/app-check/web/custom-resource)

## 必要な設定（値はまだ変更していない）

| 変数 | 内容 |
|---|---|
| `BRIDGE_APP_CHECK_CLIENT_ENABLED` | ブラウザSDKを使う場合true。既定false |
| `BRIDGE_APP_CHECK_SITE_KEY` | 対象ドメインを登録したreCAPTCHA Enterpriseの公開サイトキー |
| `FIREBASE_WEB_APP_ID` | 登録済みのFirebase WebアプリID |
| `FIREBASE_WEB_API_KEY` | Firebase Web設定用の公開APIキー。Gemini用の秘密キーと分離し、Firebaseの必要なAPIに制限する |
| `FIREBASE_PROJECT_ID` | バックエンドのFirebaseプロジェクトと一致するプロジェクトID |
| `BRIDGE_APP_CHECK_APP_IDS` | 許可するWebアプリID。カンマ区切り |
| `BRIDGE_APP_CHECK_ENFORCE` | バックエンドで必須にする場合true。有効化するとブラウザ側も必須になる |
| `BRIDGE_ALLOWED_ORIGINS` | 公開サイトの正確なHTTPS Origin。リバースプロキシが内部Originへ変更する場合に必要 |

公開設定へ渡すのはFirebase Webの公開設定とサイトキーだけ。Geminiキー、サービスアカウントの秘密鍵、アクセストークンは渡さない。環境変数のFirebaseキーとGeminiキーが同一なら、公開設定を未構成として拒否する。Secret Managerのマウントに入れたキーや、別システムで共有しているキーとの同一性は自動検査できないため、運用側でも分離を確認する。

公開Firebaseキーは機密として扱わないが、アプリのデータ認可を代替するものではない。Firestore/StorageのクライアントRulesは全拒否を維持する。キーのAPI制限、別サービスへの使い回し禁止、認証とサーバー認可が必要。

## クラウド側で行うこと（事前確認が必要）

- Firebase WebアプリとreCAPTCHA Enterpriseの対象ドメインを確認し、App Checkに登録する。
- ステージングで実トークンを取得し、正当・改変・期限切れ・別アプリを使って検証する。
- Cloud Runの実行主体のApp Check検証権限とFirebaseプロジェクトを確認する。
- データ取り扱い、サイト上の通知、割り当て、料金を確認する。
- ステージングで確認後、承認を得て本番の環境変数・強制設定を変更する。

固定IDの共有デモをApp Checkで保護しても、実ユーザー認証にはならない。実データを扱う場合はFirebase Authenticationを必須にする。

## 依存関係の監査

公式の `firebase` パッケージを導入。Node.js 22以降の既存方針を維持するため、Web SDKは12.19.0を採用した。Firebase Adminを14.5.0へ更新し、古いFirestore関連の依存を更新した。`@grpc/grpc-js` は同じメジャーの修正版1.14.7以降をoverrideし、互換範囲の監査修正を適用した。`npm audit fix --force` は実行していない。

[Firebase Admin公式リリースノート](https://firebase.google.com/support/release-notes/admin/node)

2026-11-07の監査では検出0件。これは監査データベースに報告済みの依存脆弱性に限る結果で、脆弱性が存在しない保証ではない。実Firestore・認証・App CheckでのSDK更新後の検証は本番前に必要。

## 変更ファイル

- `app/app-check.ts`：公式Web SDKの遅延ロードと自動更新。
- `lib/app-check-schema.ts`：クライアント用の公開設定スキーマ。サーバー設定処理を分離。
- `lib/app-check-config.ts`：公開用許可リスト、設定不足・キーの使い回しの拒否、CSP生成。
- `lib/bridge-transport.ts`：トークン送信、期限、限定再試行、外部URLへの送信禁止。
- `lib/app-check-verifier.ts`：バックエンドの注入可能な検証境界。
- `app/api/bridge/route.ts`：公開設定とバックエンド検証の接続。
- `app/page.tsx`：共通通信への接続と失敗時の表示。
- `proxy.ts` / `next.config.ts`：実行時のCSPと既存ヘッダー。
- `package.json` / `package-lock.json`：公式SDKと依存修正。
- `.env.example`：未有効の設定例。
- `tests/app-check-client.test.mjs`：設定、起動の競合、自動更新、タイムアウト、外部URL、検証境界のテスト。
- `tests/security-api.test.mjs`：実際のAPIとの起動設定の整合、ビルド時と異なる実行時CSPのテスト（最終本番ビルドでの実行は未完了）。
- `tests/dev-security-smoke.mjs`：動作中のループバックの架空デモだけに対する、データを変更しないAPI確認。`node --test tests/dev-security-smoke.mjs` で実行する。
- `AGENTS.md`：Next.js開発サーバーが生成した、同梱ドキュメントの参照指示。

## 今回の検証結果

- 型チェック成功。単体・モック等の検査36件が成功した（App Checkの追加8件を含む）。現在の開発バンドル28ファイルにもサーバーのキー設定・Admin SDKが含まれないことを確認した。
- 動作中のローカル開発サーバーに対するAPI確認5件が成功した。未認証、権限変更、別組織・現場、未承認版、不正JSON、本文サイズ、Origin、ヘッダーを確認した。データを変更する要求は拒否されるものだけを送信し、実AIは呼んでいない。
- ブラウザで管理者のログインとマニュアル編集を確認し、未保存の変更は確認欄を選択しても公開できないことを確認した。編集内容は保存せず破棄した。390px幅でスタッフ画面も確認した。
- 開発サーバーのReactデバッグに必要なunsafe-evalをdevelopmentの場合だけ許可し、productionでは許可しないことをテストした。Next.js同梱のCSPガイドに合わせた対応。
- 依存関係監査は検出0件。監査結果は現在のデータベースに限る。
- 最終ソースの本番ビルドは、WindowsのEPERM（生成先のフォルダ作成拒否）で完了していない。出力先への書き込み許可確認・新規出力先への退避・ワーカー設定の切り分け後も再発した。ワーカーの実験設定は元へ戻した。
- 本番ビルドを使う6件の統合テストは今回の最終ソースでは未確認。前回の33件成功という結果を、今回のSDK更新後の成功として扱わない。生成途中のバンドル検査も本番成果物全体の検証を代替しない。

PC内の開発プレビューは http://127.0.0.1:3003 で確認できた。外部共有デモの再起動は引き続き承認方式の制限で拒否されており、復旧していない。実App Checkトークン、実Firestore、実DLP、実Vertexでの検証も未完了。

GitHubへの書き込みも再確認したが、連携APIが403 Resource not accessible by integrationを返した。ローカルのソースとZIPを成果物とし、GitHub反映済みとは報告しない。
