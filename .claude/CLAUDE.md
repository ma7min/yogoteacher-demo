# yogoteacher 開発ルール

## ブランチ戦略
- **開発・コミット・プッシュはすべて `main` ブランチに直接行う**
- PRは作成しない（`create_pull_request` は使わない）
- コミット後は `git push origin main` でプッシュする
- AI Studio連携リポジトリ: `ma7min/yogoteacher-app`（mainブランチ）
- 元リポジトリ: `ma7min/yogoteacher`（両方にpushすること）

## プロジェクト概要
養護教諭採用試験の過去問・予想問題練習アプリ（React + TypeScript + Vite + Firebase + Gemini AI）

## 主要ファイル
- `src/App.tsx` — メインアプリ（状態管理・ナビゲーション）
- `src/components/Dashboard.tsx` — ダッシュボード（分析タブにカレンダーあり）
- `src/components/SelectionScreen.tsx` — 問題選択・復習フィルター
- `src/components/QuizPlayArea.tsx` — クイズ画面
- `src/components/ReportScreen.tsx` — 成績レポート・問題アーカイブ
- `src/data/questions.ts` — 問題データ
- `src/types.ts` — 型定義

## データ永続化
- localStorage（デモモード・ゲスト）
- Firestore（ログイン済みユーザー）
- キー例: `local_answers_history_${userId}`, `local_attempts_history_${userId}`, `local_answer_timestamps_${userId}`, `bookmarks`
