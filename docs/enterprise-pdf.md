# Bridge Work 2.0：企業PDFの取り込み

## デモの手順

1. リポジトリで `npm ci`、`npm run demo`。ブラウザーで http://127.0.0.1:3005 を開く。
2. 管理者としてログインし、メニューの「マニュアル」→「マニュアルを追加」を開く。「試演用PDFをダウンロード」でサンプルを保存する。
3. サンプルを選択する。スタッフから原本の図を確認するデモでは、原本共有のチェックを入れてから「PDFを保存」を押す。
4. 「このPDFのAI解析を許可」→「解析する」→候補の「確認・編集する」。手順と根拠を確認し、公開範囲を指定して承認する。
5. スタッフで「入口マットの確認」と入力し、「似た質問を探す」。候補を開き、手順と原本の該当ページを確認する。手順で解決しない場合は相談へ進める。

このデモは架空データを使い、同梱サンプルPDFのみ模擬解析します。企業PDFをデモへアップロードしないでください。

## 本番準備

- Firebase Authentication と Firestore の既存設定を維持。ブラウザーから Firestore、Storage、Vertex AI へ直接アクセスさせず、Next.js サーバーが Firebase ID トークンと組織・現場・役割・公開範囲を照合する。
- Cloud Run の専用実行サービスアカウントに ADC を使う。鍵ファイルや Gemini API キーは不要。ローカルの実接続では、権限のある開発用アカウントで `gcloud auth application-default login`。実行アカウントを本番用と開発用で分ける。
- 検証環境に Vertex AI、Document AI、Cloud Storage、Sensitive Data Protection を用意する。Layout Parser のバージョンを明示し、利用するバージョンの図表、スキャン、上限、処理場所を事前に実機確認する。
- 原本用バケットは Uniform bucket-level access と Public access prevention を有効にし、公開アクセスを付与しない。保存場所、ログ、バックアップ、復元と消去期限は組織の規程に合わせる。Document AI には許可済み原本を送信する。抽出テキストは DLP に通してから Gemini に渡す。
- 選んだモデルと処理地域について、組織のデータ処理承認を得てから解析を有効化する。Vertex AI であっても、機能に応じたログ、キャッシュ、保持、リージョン、学習利用条件を個別に確認する。

| 実行用 IAM | 付与の範囲 |
| --- | --- |
| Vertex AI User `roles/aiplatform.user` | モデルを呼ぶプロジェクト |
| Document AI API User `roles/documentai.apiUser` | 対象の Layout Parser |
| Storage Object User `roles/storage.objectUser` | 原本専用バケット。カスタムロールでは対象オブジェクトの取得・作成・削除を付与 |
| Cloud Datastore User `roles/datastore.user` | 既存の Firestore データベースに必要な範囲 |
| Sensitive Data Protection の検査権限 `dlp.content.inspect` | 既存 DLP プロジェクト。検査以外の操作を追加しない |
| Firebase Auth / App Check の既存の権限 | 既存のユーザー確認、招待、App Check の構成に合わせて維持 |

| 環境変数 | 設定 |
| --- | --- |
| `BRIDGE_DEMO` | 本番は `false` |
| `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION` | Vertex AI のプロジェクトと、対象モデルを使えるロケーション |
| `GEMINI_MODEL`, `GEMINI_REVIEW_MODEL` | 生成モデルと任意の既存相談レビュー用モデル |
| `GEMINI_EMBEDDING_MODEL`, `GEMINI_SIMILARITY_MIN` | 任意。Vertex で使える埋め込みモデルと検索しきい値 |
| `GEMINI_GENERATE_IMAGES`, `GEMINI_IMAGE_MODEL` | 既存の画像生成を使う場合のみ。原本図の再利用には不要 |
| `BRIDGE_DOCUMENT_BUCKET` | 原本専用の非公開バケット名 |
| `BRIDGE_DOCUMENT_PROCESSOR` | `projects/PROJECT/locations/us/processors/ID/processorVersions/VERSION` 形式（場所は `us` または `eu`） |
| `BRIDGE_DOCUMENT_AI_APPROVED` | データ処理条件確認後のみ `true`。さらに各PDFで管理者の許可が必要 |
| `BRIDGE_ALLOW_CONFIDENTIAL_PDF` | 既定は `false`。高機密PDFの外部AI処理を承認した環境に限り変更 |
| `BRIDGE_SENSITIVE_PROVIDER`, `BRIDGE_DLP_PROJECT`, `BRIDGE_PRIVACY_STRICT` | 本番では `google-dlp`、対象プロジェクト、`true` |
| Firebase / App Check | 既存の設定と `.env.example` を参照 |

## 変更箇所と運用上の制限

- `lib/ai.ts`：既存の分類、検索、翻訳、生成、画像、Embedding の接続を公式SDKと Vertex ADC に集約。
- `lib/documents.ts`、`lib/pdf-layout.ts`、`lib/document-types.ts`、`lib/storage.ts`：検証、非公開原本、SHA-256、解析状態、ページと引用の根拠、候補の検証。
- `app/document-library.tsx`、`app/page.tsx`、`app/api/bridge/route.ts`、`lib/workflow.ts`、`lib/publication.ts`、`lib/manual-access.ts`：登録・編集・承認・公開・検索と、認証済み原本取得の統合。
- `app/manifest.webmanifest`、`app/layout.tsx`、`public/bridge-icon-*.png`：対応ブラウザー向けホーム画面／デスクトップ用アイコン。インストール方法と可否はブラウザーに依存。
- 1ファイル1.5 MB・10ページ、現場あたり30件を目安に制限。解析はバックグラウンドで実行し、停止後は管理者が再試行できる。本番でジョブの自動再配送が必要な場合は、永続キューの追加が必要。
- 削除は、関連マニュアルがないPDFのみ。原本と未公開のチャンク・候補を削除し、再登録・追跡用に最小限の管理レコードを残す。関連マニュアルがある場合は削除を拒否。バックアップ、Storage soft delete の復元期間、監査ログの保存期間はインフラ側で設定する。公開済み資料と派生物をまとめて失効・削除する管理操作は未実装。
- PDFページを再利用する。複雑な図表の切り出し・画像単位の解釈・本文への画像埋め込み、自動マルウェアスキャン、大量バッチ、差分更新は未実装。PDFの静的検査だけで安全性は保証できない。情報が不足する場合は候補を承認せず、原本を確認して手動で補う。
- Layout Parser の標準料金では 1,000ページあたり US$10。10ページなら目安 US$0.10（Layout Parser のみ）。別途、Gemini 生成・品質確認・Embedding・DLP・Cloud Storage・実行環境の料金がかかる。管理画面の概算は Layout Parser 分のみ。
- `npm run build` と `npm test` で検証。PDFの入力検査、Layout出力の模擬データ、サンプルPDFから承認・検索・原本参照への接続を確認する。実クラウドでの処理品質・IAM・リージョン・保持条件は、利用承認後に非機密の検証資料で確認する。

Google公式資料：[Google Gen AI SDK](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/sdks/overview) · [Document AI Layout Parser](https://docs.cloud.google.com/document-ai/docs/layout-parse-chunk) · [Document AI の上限](https://docs.cloud.google.com/document-ai/limits) · [Document AI IAM](https://docs.cloud.google.com/document-ai/docs/access-control/iam-roles) · [Document AI 料金](https://cloud.google.com/products/document-ai/pricing) · [Vertex AI 料金](https://cloud.google.com/model-garden/pricing) · [データ保持条件](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention)
