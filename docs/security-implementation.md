# Bridge Work 2.0 セキュリティ強化・最終報告

## 対象と実施範囲

既存のNext.js / React / Firebase Admin / Gemini公式SDK構成を維持した。コード変更とローカルのモック検証を実施し、クラウドのAPI有効化、IAM変更、課金設定、実データ移行・削除は行っていない。変更前の深刻度別所見は [監査結果](security-audit.md) を参照。

## 発見した問題と修正

| 所見 | 修正 |
|---|---|
| Critical：固定IDのデモ認証を本番へ誤配置できる | 本番ビルドで明示的なデモ許可がなければ503。許可されたデモも架空データ専用で実認証ではない |
| High：AI呼び出し全体の個人情報・秘密情報検査不足 | 翻訳・要約・4工程・検索・Embedding・任意の図解の共通境界でマスク。生成後と承認時も検査。本番の検査失敗時はAI送信・公開を拒否 |
| High：保存層のスコープ検証不足 | 読み込みと更新で組織・現場・レコードIDを検証。ID衝突による別組織レコード上書きを拒否 |
| High：利用回数・AI並列数が無制限 | 本番はFirestoreトランザクションでユーザー・組織・AI利用を共有制限。期限付きリースを使用。429とRetry-Afterを返す |
| Medium：編集と公開の版固定、旧公開版の保持が不足 | 内容変更と承認の同時要求を拒否。下書き保存後の同一版のみ承認。旧公開内容をスナップショットで保持し、新しい下書きは非公開 |
| Medium：リクエスト本文を全量読んでから上限確認 | ストリーム読み込み時にバイト上限を検証。ログイン8KB・通常操作2.4MB、JSON形式、Originも検証 |
| Medium：監査・App Check・共通ヘッダー不足 | 重要操作・拒否・失敗の構造化監査。App Checkの任意のバックエンド検証。CSP・フレーム拒否・nosniff等を追加 |
| Low：スタッフ向け出力が内部フィールドの除外リスト | 許可リストへ変更。引用・根拠ID・機密検査・下書きスナップショット・監査等をスタッフへ返さない |

## 認証・組織・公開の境界

Firebase AuthenticationのIDトークンをサーバーで失効確認付き検証し、権限はサーバー管理のプロフィールから取得する。リクエストからroleやorganizationIdを受け入れない。チャットは本人、管理者は担当する組織・現場、承認・編集は管理者に限定する。Firestore/Storage Rulesの全拒否は維持した。ブラウザから直接データを更新できない。

既存の `users/{uid}` を標準所属の権限元として維持する。別組織をAPIの `X-Bridge-Organization` で明示する場合は、その組織の `members/{uid}` の `active:true`、role、siteIdsをサーバーが読み直す。自己申請で所属・昇格するAPIはない。複数組織の切替UI、メンバーの招待・昇格API、別組織所属のスタッフへの配信リスト拡張は未実装で、実環境のメンバー認証も未検証。

公開直前に機密検査と内容ハッシュを保存する。ハッシュはオブジェクトのキー順序を正規化し、Firestoreのマップ順序が変わっても同じ内容になる。公開版取得時も照合し、改変・未検査・検査未完了を本番では拒否する。**本番の既存マニュアルに検査記録がない場合、管理者の再確認・検査完了までスタッフへの配信を止める。** 元データは削除しない。

新しい下書きを編集している間は、以前の承認済み版を表示する。旧版の検査条件を満たさなければ配信しない。明示的な非公開化では旧公開スナップショットも配信対象から外す。新しい版を承認すると旧配信・旧閲覧の版を無効にする。全過去版を復元するアーカイブは未実装。

既存UI互換のため状態名は既存フィールドへ対応付ける：generatingは `generation.state` のqueued/analyzing/checking_gaps/writing/validating/illustrating、clarification_requiredは `reviewState=awaiting_answers`、pending_approval、publishedは `status=published`、rejectedは `reviewState=rejected`、failedは `generation.state=failed`。保留はheldとして別に維持する。

## 機密検査とAI防御

ローカル検査はメール、電話、住所表現、APIキー形式、Bearer/JWT、秘密鍵、パスワード等のラベル、社外秘等の明示表現を検出・マスクする。任意の氏名・顧客情報・暗黙の業務秘密を完全に検出できるものではない。

Google Sensitive Data Protection接続口はADCで `content:inspect` を呼び、PERSON_NAME / PHONE_NUMBER / EMAIL_ADDRESS / STREET_ADDRESS / CREDIT_CARD_NUMBER / IBAN_CODE / AUTH_TOKEN / PASSWORDを検査する。`includeQuote:false` とし、検出種類・件数・リスクのみ保存する。UTF-8バイト範囲と重複範囲を検証してマスクする。検査不能・不正な範囲・結果切り捨て時は失敗として扱い、本番ではローカル検査へ黙って退避しない。実サービス接続は未実施。

デモだけはローカル簡易検査を利用できる。本番は `BRIDGE_DEMO=false` により厳格検査を強制し、ローカル設定だけでは公開できない。画像内の文字を検査する処理は未対応のため、厳格モードで画像付きマニュアルは公開保留になる。**画像の機密検査ができたとは報告しない。** 実画像対応にはOCR/DLP画像検査アダプターの追加が必要。

4工程、Structured Output、Zod、実在引用、発言者の権威、訂正情報、危険操作の許可、遷移先・循環・到達不能の検証を維持する。AIは公開状態やユーザー権限を操作できず、任意コード・HTML・URLを実行しない。AI判定だけでは危険性・意味の一致を保証できないため、管理者の承認を必須とする。

## 追加・活用したGoogle技術

- Firebase Authentication / Firestore：既存認証を再利用し、保存層の認可、承認版、組織別監査、共有カウンターを追加。
- Sensitive Data Protection：ADCによる検査アダプターを実装。未有効化・実接続未検証。
- Firebase App Check：既存Admin SDKでトークン検証・アプリID制限を実装。ブラウザでのトークン取得処理は未追加、現時点では無効を維持する。
- Cloud Logging：Cloud Runで収集できるJSON構造化ログを出力。実際のログシンク・閲覧IAM・保持期間の設定は未実施。
- Vertex AI：既存のADC経路を維持し、本番の第一候補とする。Developer APIから勝手に切替えない。
- Secret Manager：Cloud Runでマウントしたファイルを `GEMINI_API_KEY_FILE` で読み込む接続口を追加。シークレット作成・アクセス付与・マウントは未実施。

学習利用・保存期間・不正利用監視によるログ保存・リージョン・契約条件は採用サービスと契約で確認する。「データが一切保持されない」とは保証しない。[Googleの不正利用監視](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/abuse-monitoring) と [Developer APIの保持条件](https://ai.google.dev/gemini-api/docs/zdr) を導入時に確認する。

## 変更したファイル

| ファイル | 変更 |
|---|---|
| `lib/security-content.ts` | 純粋な検査・マスク、検出概要、正規化ハッシュ |
| `lib/privacy.ts` | 差し替え可能な検査、Sensitive Data Protection、失敗時の停止 |
| `lib/publication.ts` | 承認スナップショット、公開ハッシュ検証、公開用許可リスト |
| `lib/security-runtime.ts` | リクエスト・組織・AI制限、期限付きリース、構造化監査 |
| `lib/storage.ts` / `lib/model.ts` | スコープ不変条件、任意の組織所属検証、新しいデータフィールド |
| `lib/workflow.ts` / `lib/manuals.ts` / `lib/ai.ts` | 版固定、却下、機密検査、全AI処理の共通境界、Secret Managerマウント対応 |
| `lib/manual-assets.ts` | MIMEと実画像の一致、アニメーション拒否、逐次デコードによるメモリ抑制 |
| `app/api/bridge/route.ts` | App Check、認証・制限・監査、本文上限、Origin、未知の入力フィールドの拒否 |
| `app/manual.tsx` / `app/program-editor.tsx` / `app/manual-editor.tsx` / `app/page.tsx` | 検査・保留理由、旧公開版の表示、保存してから承認する操作 |
| `next.config.ts` | CSP等のHTTPヘッダー |
| `.env.example` / `README.md` / `docs/security-*.md` | 設定・監査・運用・制約 |
| `tests/security*.mjs` / 既存テスト | 攻撃ケース、回帰検証、SDKタイムアウト等 |

## 追加データ

既存の `organizations/{org}/sites/{site}/...` を維持する。

- Manual：`publishedSnapshot`（直近の承認版、再帰の入れ子を除去）、`publicationSuppressed`、`security:{contentHash,inspection:{provider,available,complete,findings:[{type,risk,count}]},checkedAt}`、rejected状態。
- `organizations/{org}/auditLogs/{autoId}`：日時、実行者ID、組織ID、固定の操作名、結果、エラーコード、対象IDのハッシュ。本文・検出値・プロバイダーの生エラーは保存しない。
- `_bridgeSecurityLimits/{sha256(scope)}`：分カウンター、実行中リースと期限、削除候補日時 `expireAt`。本番はFirestoreトランザクション、デモは単一プロセス内メモリ。
- 任意の `organizations/{org}/members/{uid}`：`active`, `role`, `siteIds`。管理用サーバー・管理者の信頼できる運用でのみ作成する。

スナップショットも同じFirestoreドキュメントに入るためサイズ上限を超える更新は拒否する。本文・図が大きい場合は、今後の版コレクション分離が必要。既存データを自動移行・削除する処理はない。

## 必要な環境変数

| 変数 | 用途・既定 |
|---|---|
| `BRIDGE_DEMO` | 本番は必ずfalse。trueは固定IDの架空デモ |
| `BRIDGE_ALLOW_PUBLIC_DEMO` | 本番ビルドの架空デモ利用を明示許可。既定false。本番実データには使用禁止 |
| `BRIDGE_SENSITIVE_PROVIDER` | `google-dlp` または `local`。本番はgoogle-dlpが必要 |
| `BRIDGE_PRIVACY_STRICT` | デモでも厳格にする場合true。本番は値に関係なく厳格 |
| `BRIDGE_DLP_PROJECT` | 検査プロジェクト。未設定ならGOOGLE_CLOUD_PROJECT |
| `BRIDGE_APP_CHECK_ENFORCE` | トークン検証を強制する場合true。クライアント設定前はfalse |
| `BRIDGE_APP_CHECK_APP_IDS` | 許可するFirebaseアプリIDのカンマ区切り。強制時は必須 |
| `BRIDGE_ALLOWED_ORIGINS` | プロキシの内部Originと異なる公開URLの正確なOrigin。カンマ区切り、ワイルドカードなし |
| `BRIDGE_USER_REQUESTS_PER_MINUTE` | 既定90 |
| `BRIDGE_ORG_REQUESTS_PER_MINUTE` | 既定900 |
| `BRIDGE_AI_CALLS_PER_MINUTE` | 既定60。組織単位の論理SDK呼び出し数。SDKの限定リトライは別HTTP試行になる |
| `BRIDGE_AI_CONCURRENCY` | 既定4。AI呼び出しの同時リース数、リース期限120秒 |
| `GEMINI_API_KEY_FILE` | Secret Managerマウントの絶対パス。環境変数GEMINI_API_KEYがあればそちらを優先 |

Firebase、Geminiモデル、Vertex ADC等の既存変数は維持する。APIキーはクライアント設定へ渡さない。

## Google Cloud側の準備（未実施）

1. 開発・本番プロジェクトを分け、Cloud Runの専用実行サービスアカウントを用意する。秘密鍵ファイルを発行・コミットせず、ADCを利用する。
2. 承認後にSensitive Data Protection APIを有効化し、実行主体へ `dlp.content.inspect` を含む最小権限を付与する。対象プロジェクト・リージョン・検出器・費用・データ取り扱いを確認する。現在の実装はglobalエンドポイントを使う。[検査設定](https://docs.cloud.google.com/sensitive-data-protection/docs/reference/rest/v2/InspectConfig)、[IAM](https://docs.cloud.google.com/sensitive-data-protection/docs/access-control/roles-permissions)。
3. Vertex AI利用時は必要なモデルと実行主体の権限を確認する。キー方式を残す場合はSecret Managerの特定シークレットだけにAccessorを付与し、Cloud Runへマウントする。[マウント手順](https://docs.cloud.google.com/run/docs/configuring/services/secrets)。
4. Firestoreの監査・制限コレクションへサーバーがアクセスできるIAMを確認する。クライアントRulesは全拒否。制限レコードのTTLを有効化する場合は `expireAt` を指定する。TTL未設定でも期限判定はアプリで行うが、不要なレコードは自動削除されない。
5. App Checkを採用する場合はWebアプリ登録・プロバイダー設定・ブラウザSDKによるトークン送信を追加し、実トークンで検証してから強制する。[公式バックエンド検証](https://firebase.google.com/docs/app-check/custom-resource-backend)。CSPも採用するクライアントプロバイダーに合わせて調整する必要がある。
6. Cloud Loggingの閲覧者・ログ保持・アクセス拒否や利用超過のアラートを設定する。アプリの監査ドキュメントの閲覧APIは未提供。クラウド側のIAMで閲覧を制限する。

これらの有効化・IAM・課金・本番設定変更はユーザーの確認後に行う。

## テスト範囲と残る確認

2026-11-07の最終検証：本番ビルド成功（TypeScript検証を含む）、自動テスト33件成功・失敗0件。クライアントバンドルにサーバーのキー設定・Admin SDKが含まれないことも検査した。Windowsの一時的なビルドディレクトリ作成エラーは、旧ビルドをワークスペース内へ退避して再ビルドすることで解消した。

共有デモの再起動は実行環境から追加承認を要求され、当該承認方式が無効のため拒否された。ネットワーク権限の許可後も起動できなかったため、新しいUIのブラウザ操作と共有URLの稼働は未確認。今回のUI検証を完了したとは報告しない。

本番ビルド、TypeScript、Nodeテストで検証。外部GeminiはHTTP境界をモックし、Sensitive Data Protectionは検査関数の注入で検証する。実Firebase認証・App Checkの実トークン・実DLP・実Vertex・Firestore複数インスタンスは未検証。

| 要求ケース | 検証 |
|---|---|
| 未認証・スタッフ管理者操作・自己昇格 | security-api：401/403、role/organizationId入力の400 |
| 別組織のチャット・マニュアル・検索 | security-api：404、検索対象・取得一覧から除外 |
| 未承認・編集後の未承認公開 | security-api：旧承認版保持、新しい版404、同時変更承認拒否、古い版409 |
| プロンプトインジェクション | security / interactive-generation：スタッフ発言を権威にできず、架空ID・実行ブロックを拒否。実モデルの攻撃耐性評価ではない |
| PII・APIキー | security：マスク、検出値を保存しない、未検査保留、公開拒否 |
| 不正JSON・根拠のない操作・不正分岐 | manual-generation / interactive-generation：失敗・保留、限定修正 |
| 大量リクエスト | security-api：429とRetry-After、security：共有状態のカウンター・期限遷移。Firestore実並列検証は未実施 |
| 重複解決・重複結果 | workflow / manual-generation：1件だけ作成・記録 |
| APIタイムアウト | provider-mock / manual-generation：generation-timeoutで非公開の失敗状態 |
| 不正添付・外部URL | manual-assets / security-api：不正データ・MIME偽装・SVG・外部URLを拒否 |
| 監査への機密混入 | security-api：送信したメール・キーがログに現れないことを確認 |

## 残存リスク・本番前チェックリスト

| 項目 | 状態 |
|---|---|
| サーバー認可・組織/現場分離・AI出力/根拠/構造の検証 | 実装済み、ローカルAPI/モック検証済み。実認証・Firestoreの検証は別途 |
| 機密検査・検査不能時の公開保留 | コードとモック検証済み。Google実接続未検証のため本番導入は一部実装 |
| 同一版承認・旧公開版保持・却下・非公開化 | 実装済み、API検証済み |
| Firestore共有レート制限・期限付きAIリース | コード実装済み、状態遷移検証済み。実複数インスタンス検証は未実施 |
| 監査 | 構造化出力とFirestore保存を実装。Cloud Logging収集・閲覧権限・保持・永続化失敗は実環境未検証 |
| App Check | バックエンドのみ一部実装。クライアント取得・実トークン検証未実装/未実施 |
| Secret Manager / Vertexの最小権限 | 接続口と既存ADC経路あり。クラウド設定・IAM監査は未実施 |
| 画像内機密情報・ウイルス検査 | 未実装。画像は再デコードするが安全を完全保証しない。厳格モードでは画像付き公開を停止 |
| 複数組織のUI・招待・管理者昇格 | 未実装。標準所属と任意のサーバー管理メンバー検証のみ |
| 高度な異常検知・Cloud Armor・保存期間/削除・完全な版復元 | 未実装（P2） |
| 耐障害ジョブキュー | 未実装。生成状態と試行IDは保存し、停止後は管理者の再生成で復旧 |

機密検出、AIの安全性、意味整合性は完全ではない。管理者確認、組織固有の秘密の検出器、実データを使う前の評価が必要。HTTPヘッダーは追加したが、CSPのscript/styleにはNext.jsの互換性のためunsafe-inlineを残し、nonceベースの厳格化は未対応。ログインの共有制限は保守的な全体制限であり、認証前DoSや総当たりにはクラウドの境界防御も必要。

Firestoreの監査は操作前にも保存し、失敗した場合は操作を開始しない。操作後の監査保存が失敗すると、操作が反映済みでもエラーになる可能性がある。完全な監査と業務更新の単一トランザクション化（outbox）は未対応。分カウンターは日次の予算上限ではなく、SDKリトライ分のHTTP試行・クラウド利用料を厳密には計上しない。
