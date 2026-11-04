import type { Language } from './model';

const labels = {
  home: ['ホーム','Home','Trang chủ'], cases: ['相談履歴','Conversations','Lịch sử tư vấn'], manuals: ['マニュアル','Guides','Hướng dẫn'],
  analyze: ['AI 分析','AI insights','Phân tích AI'], workspace: ['ワークスペース','WORKSPACE','KHÔNG GIAN LÀM VIỆC'],
  demo: ['架空のデモデータ','Fictional demo data','Dữ liệu demo giả định'], signout: ['ログアウト','Sign out','Đăng xuất'],
  employee: ['スタッフ','Staff','Nhân viên'], manager: ['管理者','Manager','Quản lý'], welcome: ['こんにちは','Hello','Xin chào'],
  hero: ['仕事の「困った」を相談しよう','What do you need help with?','Bạn cần hỗ trợ việc gì?'],
  intro: ['母語で質問すると、過去の回答やマニュアルを探せます。','Ask in your language to find past answers and guides.','Hỏi bằng ngôn ngữ của bạn để tìm câu trả lời và hướng dẫn.'],
  placeholder: ['例：階段はどこまで掃除しますか？','Example: Which stairs should I clean?','Ví dụ: Tôi cần dọn cầu thang từ tầng nào đến tầng nào?'],
  search: ['似た質問を探す','Find related answers','Tìm câu trả lời tương tự'], searching: ['処理中…','Working…','Đang xử lý…'],
  send: ['管理者に相談する','Ask a manager','Hỏi người quản lý'], similar: ['関連するナレッジ','Related knowledge','Kiến thức liên quan'],
  noMatch: ['候補が見つかりませんでした。管理者に相談できます。','No related answers. You can ask a manager.','Không tìm thấy câu trả lời. Bạn có thể hỏi quản lý.'],
  confirmSite: ['現場と作業条件が同じか確認してください。','Check that your site and working conditions match.','Hãy kiểm tra địa điểm và điều kiện làm việc có giống nhau không.'],
  selfResolve: ['この情報で解決した','This solved my question','Thông tin này đã giúp tôi giải quyết'],
  resolve: ['解決しました','Mark as resolved','Đã giải quyết'], resolution: ['解決方法','How did you resolve it?','Bạn đã giải quyết thế nào?'],
  recent: ['最近の相談','Recent conversations','Trao đổi gần đây'], all: ['すべて見る','View all','Xem tất cả'],
  empty: ['まだ項目がありません。','Nothing here yet.','Chưa có mục nào.'], new: ['未対応','New','Mới'], active: ['対応中','In progress','Đang xử lý'], resolved: ['解決済み','Resolved','Đã giải quyết'],
  original: ['原文','Original','Nguyên văn'], translation: ['AI 翻訳・参考訳','AI / reference translation','Bản dịch tham khảo'], unavailable: ['翻訳を取得できませんでした','Translation unavailable','Chưa có bản dịch'],
  message: ['メッセージを入力','Write a message','Nhập tin nhắn'], reply: ['送信','Send','Gửi'], published: ['公開済み','Published','Đã xuất bản'], draft: ['下書き','Draft','Bản nháp'],
  site: ['現場','Site','Địa điểm'], task: ['対象作業','Task','Công việc'], purpose: ['目的','Purpose','Mục đích'], tools: ['準備する道具','Tools','Dụng cụ'],
  steps: ['作業手順','Steps','Các bước'], cautions: ['注意事項','Cautions','Lưu ý'], mistakes: ['よくある間違い','Common mistakes','Lỗi thường gặp'],
  checks: ['完了時の確認','Final checks','Kiểm tra cuối'], title: ['タイトル','Title','Tiêu đề'], refresh: ['更新','Refresh','Làm mới'],
  onlyJapanese: ['日本語版を表示しています。','Showing the Japanese version.','Đang hiển thị bản tiếng Nhật.'],
  fallback: ['現場・作業名で検索した候補です。','Matched using task keywords.','Kết quả dựa trên từ khóa công việc.'],
  help: ['仕事について質問する','Ask a work question','Hỏi về công việc'],
  voice: ['音声入力','Voice input','Nhập bằng giọng nói'],
  listening: ['聞き取り中…','Listening…','Đang nghe…'],
  voiceError: ['音声を認識できませんでした。テキストでも入力できます。','Could not recognize speech. You can type your question.','Không nhận dạng được giọng nói. Bạn có thể nhập câu hỏi.'],
  manualFits: ['このマニュアルは質問の作業内容と現場に合っていますか？','Does this guide match your task and site?','Hướng dẫn này có phù hợp với công việc và địa điểm của bạn không?'],
  showManual: ['はい、マニュアルを表示','Yes, open the guide','Có, mở hướng dẫn'],
  skipManual: ['いいえ、別の方法を探す','No, skip this guide','Không, bỏ qua hướng dẫn này'],
  manualQuestion: ['質問内容','Question','Nội dung câu hỏi'],
  procedure: ['対処法','What to do','Cách xử lý'],
  procedureImage: ['対処法のイラスト','Illustration of the procedure','Hình minh họa cách xử lý'],
  conversationUpdated: ['新しい返信が届きました。相談を更新してから解決してください。','A new reply arrived. Refresh the conversation before marking it resolved.','Có phản hồi mới. Hãy làm mới cuộc trò chuyện trước khi đánh dấu đã giải quyết.'],
  error: ['操作に失敗しました。再度お試しください。','Something went wrong. Please try again.','Có lỗi xảy ra. Vui lòng thử lại.']
} as const;
export function copy(language: Language, key: keyof typeof labels) {
  return labels[key][{ja: 0, en: 1, vi: 2}[language]];
}
