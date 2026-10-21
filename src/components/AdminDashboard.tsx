import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, Users, BarChart3, HelpCircle, FileSpreadsheet, RefreshCw, AlertCircle, ArrowLeft, Shield, Plus, Trash2, Megaphone } from 'lucide-react';
import { db, auth, handleFirestoreError, OperationType, isFirebaseMock } from '../lib/firebase';
import { collection, getDocs, query, orderBy, limit, setDoc, doc, deleteDoc, serverTimestamp } from 'firebase/firestore';

interface AdminDashboardProps {
  onGoBack: () => void;
  userEmail: string | null;
}

interface AnswerRecord {
  id: string;
  userId: string;
  userEmail: string;
  problemId: string | number;
  field: string;
  questionText: string;
  isCorrect: boolean;
  timestamp: any;
  isAiQuestion?: boolean;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onGoBack, userEmail }) => {
  const [records, setRecords] = useState<AnswerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  interface Announcement {
    id: string;
    title: string;
    text: string;
    date: string;
    createdAt?: any;
  }

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announceTitle, setAnnounceTitle] = useState('');
  const [announceText, setAnnounceText] = useState('');
  const [announceDate, setAnnounceDate] = useState(() => {
    const today = new Date();
    return today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  });
  const [isAnnounceLoading, setIsAnnounceLoading] = useState(false);
  const [announceMsg, setAnnounceMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const fetchAnnouncements = async () => {
    try {
      if (db && !isFirebaseMock) {
        const snapshot = await getDocs(collection(db, 'app_updates'));
        const list: Announcement[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          list.push({
            id: doc.id,
            title: data.title || '',
            text: data.text || '',
            date: data.date || '',
            createdAt: data.createdAt,
          });
        });

        // Client-side sort by createdAt desc
        list.sort((a, b) => {
          const tA = a.createdAt && typeof a.createdAt.toMillis === 'function'
            ? a.createdAt.toMillis()
            : (a.createdAt && typeof a.createdAt.toDate === 'function' ? a.createdAt.toDate().getTime() : Number(a.createdAt || 0));
          const tB = b.createdAt && typeof b.createdAt.toMillis === 'function'
            ? b.createdAt.toMillis()
            : (b.createdAt && typeof b.createdAt.toDate === 'function' ? b.createdAt.toDate().getTime() : Number(b.createdAt || 0));
          return tB - tA;
        });

        setAnnouncements(list);
      } else {
        // Fallback for mock/demo
        setAnnouncements([]);
      }
    } catch (err) {
      console.warn("お知らせの取得に失敗しました (Permissions or Offline):", err);
    }
  };

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!announceTitle || !announceText || !announceDate) {
      setAnnounceMsg({ text: "すべての項目を入力してください。", isError: true });
      return;
    }

    const adminEmails = ['admin@example.com'];
    if (!auth.currentUser || !auth.currentUser.email || !adminEmails.includes(auth.currentUser.email.toLowerCase())) {
      setAnnounceMsg({ text: "管理者権限が必要です。", isError: true });
      return;
    }

    setIsAnnounceLoading(true);
    setAnnounceMsg(null);
    try {
      if (db && !isFirebaseMock) {
        const safeEmail = String(userEmail || 'admin').replace(/[^a-zA-Z0-9]/g, '_');
        const now = new Date();
        const dateStr = now.toISOString().slice(0,10).replace(/-/g, '');
        const timeStr = now.toTimeString().slice(0,8).replace(/:/g, '');
        const customId = `update_by_${safeEmail}_${dateStr}_${timeStr}`;
        const ref = doc(db, 'app_updates', customId);
        await setDoc(ref, {
          title: announceTitle,
          text: announceText,
          date: announceDate,
          createdAt: Date.now()
        });
        setAnnounceMsg({ text: "お知らせを正常に追加・配信しました！📢", isError: false });
        setAnnounceTitle('');
        setAnnounceText('');
        const today = new Date();
        const formattedToday = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
        setAnnounceDate(formattedToday);
        await fetchAnnouncements();
      } else {
        // Mock demo mode addition support
        const newAnnounce = {
          id: `mock_${Date.now()}`,
          title: announceTitle,
          text: announceText,
          date: announceDate
        };
        setAnnouncements(prev => [newAnnounce, ...prev]);
        setAnnounceMsg({ text: "デモモード：お知らせを作成しました（リロードでリセットされます）📢", isError: false });
        setAnnounceTitle('');
        setAnnounceText('');
        const today = new Date();
        const formattedToday = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
        setAnnounceDate(formattedToday);
      }
    } catch (err: any) {
      console.warn("お知らせの配信に失敗しました:", err);
      setAnnounceMsg({ text: `保存に失敗しました(権限エラー等の場合、ページを一度リロードしてください): ${err.message || err}`, isError: true });
    } finally {
      setIsAnnounceLoading(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!window.confirm("このお知らせを削除してもよろしいですか？")) return;
    try {
      if (db && !isFirebaseMock) {
        const ref = doc(db, 'app_updates', id);
        await deleteDoc(ref);
        await fetchAnnouncements();
      } else {
        setAnnouncements(prev => prev.filter(item => item.id !== id));
      }
    } catch (err: any) {
      console.error("Failed to delete announcement:", err);
      alert(`削除に失敗しました: ${err.message || err}`);
    }
  };

  // Load records from Top Level examAnswers and consolidated sessionSummaries Firestore
  const fetchAllAnswerRecords = async () => {
    setLoading(true);
    setError(null);
    try {
      if (db && !isFirebaseMock) {
        const fetched: AnswerRecord[] = [];

        // 1. レガシーな1問ごとの回答群 (examAnswers) のロード
        try {
          const oldQ = query(collection(db, 'examAnswers'), orderBy('timestamp', 'desc'), limit(1000));
          const oldSnapshot = await getDocs(oldQ);
          oldSnapshot.forEach((doc) => {
            const data = doc.data();
            fetched.push({
              id: doc.id,
              userId: data.userId || '不明なUID',
              userEmail: data.userEmail || '不明なメールアドレス',
              problemId: data.problemId || 0,
              field: data.field || '未分類',
              questionText: data.questionText || '',
              isCorrect: data.isCorrect ?? false,
              timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp || Date.now()),
              isAiQuestion: false
            });
          });
        } catch (oldErr) {
          console.error("Failed to load legacy examAnswers records:", oldErr);
          try {
            handleFirestoreError(oldErr, OperationType.GET, 'examAnswers');
          } catch (e) {}
        }

        // 1.5. AI予想問題専用の1問ごとの回答群 (aiExamAnswers) のロード
        try {
          const aiQ = query(collection(db, 'aiExamAnswers'), orderBy('timestamp', 'desc'), limit(1000));
          const aiSnapshot = await getDocs(aiQ);
          aiSnapshot.forEach((doc) => {
            const data = doc.data();
            fetched.push({
              id: doc.id,
              userId: data.userId || '不明なUID',
              userEmail: data.userEmail || '不明なメールアドレス',
              problemId: data.problemId || 0,
              field: data.field || '未分類',
              questionText: data.questionText || '',
              isCorrect: data.isCorrect ?? false,
              timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp || Date.now()),
              isAiQuestion: true
            });
          });
        } catch (aiOldErr) {
          console.error("Failed to load aiExamAnswers records:", aiOldErr);
        }

        // 2. 超軽量・低コストなセッション集約回答群 (sessionSummaries) のロード
        try {
          const newQ = query(collection(db, 'sessionSummaries'), orderBy('timestamp', 'desc'), limit(500));
          const newSnapshot = await getDocs(newQ);
          newSnapshot.forEach((doc) => {
            const data = doc.data();
            const answers = data.answers || [];
            const sessionDate = data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp || Date.now());
            
            // 各セッション内の回答配列を展開して従来の個別行フォーマットにメモリ上で復元（卒論用CSVへの互換性100%保証！）
            answers.forEach((ans: any, idx: number) => {
              fetched.push({
                id: `${doc.id}-${idx}`,
                userId: data.userId || '不明なUID',
                userEmail: data.userEmail || '不明なメールアドレス',
                problemId: ans.problemId || 0,
                field: ans.field || '未分類',
                questionText: ans.questionText || '',
                isCorrect: ans.isCorrect ?? false,
                timestamp: sessionDate,
                isAiQuestion: ans.isAiQuestion ?? false
              });
            });
          });
        } catch (newErr) {
          console.error("Failed to load sessionSummaries records:", newErr);
          try {
            handleFirestoreError(newErr, OperationType.GET, 'sessionSummaries');
          } catch (e) {}
        }

        // 2.5. AI予想問題専用のセッション集約回答群 (aiSessionSummaries) のロード
        try {
          const aiNewQ = query(collection(db, 'aiSessionSummaries'), orderBy('timestamp', 'desc'), limit(500));
          const aiNewSnapshot = await getDocs(aiNewQ);
          aiNewSnapshot.forEach((doc) => {
            const data = doc.data();
            const answers = data.answers || [];
            const sessionDate = data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp || Date.now());
            
            answers.forEach((ans: any, idx: number) => {
              fetched.push({
                id: `${doc.id}-${idx}`,
                userId: data.userId || '不明なUID',
                userEmail: data.userEmail || '不明なメールアドレス',
                problemId: ans.problemId || 0,
                field: ans.field || '未分類',
                questionText: ans.questionText || '',
                isCorrect: ans.isCorrect ?? false,
                timestamp: sessionDate,
                isAiQuestion: true
              });
            });
          });
        } catch (aiNewErr) {
          console.error("Failed to load aiSessionSummaries records:", aiNewErr);
        }

        // 全部まとめて最新日付順にソート
        fetched.sort((a, b) => {
          const tA = a.timestamp instanceof Date ? a.timestamp.getTime() : 0;
          const tB = b.timestamp instanceof Date ? b.timestamp.getTime() : 0;
          return tB - tA;
        });

        // 過去の二重保存データや、同時記録データの重複を表示上で排除するスマートな重複排除フィルタ（秒単位の重複レコードを整理）
        const deduplicated: AnswerRecord[] = [];
        fetched.forEach((record) => {
          const isDuplicate = deduplicated.some(existing => {
            const timeDiff = Math.abs(existing.timestamp.getTime() - record.timestamp.getTime());
            return (
              existing.userEmail.toLowerCase() === record.userEmail.toLowerCase() &&
              existing.problemId === record.problemId &&
              existing.isCorrect === record.isCorrect &&
              timeDiff <= 30000 // 30秒以内の同一回答情報を重複とみなし1件に統合
            );
          });
          if (!isDuplicate) {
            deduplicated.push(record);
          }
        });

        setRecords(deduplicated);
      } else {
        // Fallback or demo offline data if Firebase is mocked
        loadOfflineMockRecords();
      }
    } catch (err: any) {
      console.error("Failed to load global answers for thesis:", err);
      const detailedError = err?.message || String(err);
      setError(`Firestoreからの取得中にエラーが発生しました（詳細: ${detailedError}）。`);
      loadOfflineMockRecords(); // 提供デモとしてフォールバック
    } finally {
      setLoading(false);
    }
  };

  const loadOfflineMockRecords = () => {
    // 卒業論文デモとしてダミーデータを10件生成しておもてなし
    const d = new Date();
    const mockList: AnswerRecord[] = [
      {
        id: "mock-1",
        userId: "student-1",
        userEmail: "student-a@kamakura-u.ac.jp",
        problemId: 1,
        field: "学校保健安全法",
        questionText: "学校保健計画に定めるべき事項について…",
        isCorrect: true,
        timestamp: new Date(d.getTime() - 1000 * 60 * 15) // 15分前
      },
      {
        id: "mock-2",
        userId: "student-1",
        userEmail: "student-a@kamakura-u.ac.jp",
        problemId: 4,
        field: "救急処置",
        questionText: "熱中症が疑われる児童生徒への対症法…",
        isCorrect: false,
        timestamp: new Date(d.getTime() - 1000 * 60 * 45) // 45分前
      },
      {
        id: "mock-3",
        userId: "student-2",
        userEmail: "grad-researcher@kamakura-u.ac.jp",
        problemId: 10,
        field: "解剖生理",
        questionText: "ヒトの循環器系における大動脈弁の位置…",
        isCorrect: true,
        timestamp: new Date(d.getTime() - 1000 * 60 * 120)
      },
      {
        id: "mock-4",
        userId: "student-3",
        userEmail: "seminar-guest@kamakura-u.ac.jp",
        problemId: 2,
        field: "健康相談",
        questionText: "不登校傾向にある児童へのアドバイス等…",
        isCorrect: true,
        timestamp: new Date(d.getTime() - 1000 * 60 * 200)
      }
    ];
    setRecords(mockList);
  };

  useEffect(() => {
    fetchAllAnswerRecords();
    
    // 今日の日付をセットし、お知らせの一覧を取得
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    setAnnounceDate(`${yyyy}/${mm}/${dd}`);
    fetchAnnouncements();
  }, []);

  // Calculate high-level research stats
  const totalAnswers = records.length;
  const uniqueUsers = Array.from(new Set(records.map(r => r.userEmail))).length;
  const correctCount = records.filter(r => r.isCorrect).length;
  const averageAccuracy = totalAnswers > 0 ? (correctCount / totalAnswers) * 100 : 0;

  // Handle CSS/Blob CSV downloading (UTF-8 with BOM for Direct Japanese Excel integration)
  const handleExportCSV = () => {
    if (records.length === 0) {
      alert("エクスポートできるレコードがありません。");
      return;
    }

    const headers = ["ID", "解答日時", "メールアドレス", "UID", "問題ID", "出題区分", "出題分野", "問題概要(HTML抜き)", "結果(1=正解/0=不正解)"];
    
    const rows = records.map(r => {
      // Clean HTML tags and commas for neat CSV structure
      const cleanedQuestion = r.questionText
        .replace(/<[^>]*>/g, '') // strip html
        .replace(/[\n\r,"]+/g, ' '); // remove line breaks, commas, double quotes
      
      const formattedDate = r.timestamp instanceof Date 
        ? r.timestamp.toLocaleString('ja-JP') 
        : String(r.timestamp);

      const typeLabel = r.isAiQuestion ? "AI予想問題" : "過去問";

      return [
        r.id,
        formattedDate,
        r.userEmail,
        r.userId,
        r.problemId,
        typeLabel,
        r.field,
        `"${cleanedQuestion}"`,
        r.isCorrect ? "1" : "0"
      ];
    });

    const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    
    // Add UTF-8 BOM to prevent Excel Japanese character mojibake
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `YogoQuiz_Thesis_Data_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    alert("卒業論文用CSVデータのエクスポートが成功しました！📊✨\nExcelでそのまま開くことができます。");
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header deck */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onGoBack}
            className="p-2 border border-teal-100 rounded-xl hover:bg-teal-50 text-teal-700 transition-colors shadow-sm bg-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h3 className="text-xl font-extrabold text-teal-900 flex items-center gap-2">
              <Shield className="w-5 h-5 text-teal-600" />
              管理者・卒業論文データダッシュボード
            </h3>
            <p className="text-xs text-gray-500">
              研究用に全ユーザーのクイズ正誤。CSVとしてローカルにダウンロードして集計できます。
            </p>
          </div>
        </div>
        
        <button
          onClick={fetchAllAnswerRecords}
          className="p-2 bg-white hover:bg-slate-50 border border-teal-100 rounded-xl transition-all cursor-pointer text-teal-700"
          title="データをリロード"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Database Warning */}
      {error && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-xs text-amber-800 leading-relaxed">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
          <div>
            <span className="font-bold">Firebase/Firestore 制限の通知:</span><br />
            {error}
            <div className="mt-2 text-[10px] text-amber-700">※現在は開発検証またはローカル保存のデモ用データ（モック）を代わりに表示しています。Firebaseセットアップ承認後、接続が活きるとリアルタイムにクラウドに蓄積されます。</div>
          </div>
        </div>
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-teal-50 shadow-md flex items-center gap-4">
          <div className="p-3 bg-teal-50 rounded-xl text-teal-600 font-bold shrink-0">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-gray-400 block uppercase tracking-wider">総解答件数 (Logs)</span>
            <span className="text-2xl font-black text-teal-950 font-mono">{totalAnswers}</span>
            <span className="text-xs text-gray-400 font-bold ml-1">件</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-teal-50 shadow-md flex items-center gap-4">
          <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600 font-bold shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-gray-400 block uppercase tracking-wider">ユニーク受験者 (N)</span>
            <span className="text-2xl font-black text-teal-950 font-mono">{uniqueUsers}</span>
            <span className="text-xs text-gray-400 font-bold ml-1">名</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-teal-50 shadow-md flex items-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600 font-bold shrink-0">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-gray-400 block uppercase tracking-wider">全体の平均正答率</span>
            <span className="text-2xl font-black text-teal-950 font-mono">
              {averageAccuracy.toFixed(1)}
              <span className="text-xs font-bold">%</span>
            </span>
          </div>
        </div>
      </div>

      {/* CTA Core Download */}
      <div className="bg-gradient-to-r from-teal-500 to-emerald-500 p-6 rounded-3xl text-white flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl shadow-teal-500/10">
        <div>
          <h4 className="font-extrabold text-sm md:text-base flex items-center gap-1.5">
            <FileSpreadsheet className="w-5 h-5 text-teal-100" />
            卒業論文の成果物（CSV）出力
          </h4>
          <p className="text-teal-50 text-[11px] leading-relaxed max-w-lg mt-1">
            SPSS、Excel、Rへのインポートが可能です。項目ごとに分離され、日本語データもBOM付きUTF-8仕様で文字化けせず綺麗に出し抜くことができます。
          </p>
        </div>
        <button
          onClick={handleExportCSV}
          className="px-6 py-3 bg-white text-teal-700 hover:bg-teal-50 font-black rounded-xl text-xs flex items-center gap-2 shadow-md hover:scale-105 transition-all cursor-pointer whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          CSVでエクスポートする
        </button>
      </div>

      {/* 📢 お知らせ(通知)配信管理パネル */}
      <div className="bg-white rounded-3xl border border-teal-50 shadow-xl overflow-hidden p-6 space-y-6">
        <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
          <Megaphone className="w-5 h-5 text-teal-600 animate-pulse" />
          <h4 className="font-extrabold text-gray-800 text-sm sm:text-base">📢 お知らせ・アップデート情報の配信管理</h4>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 左カラム：新規追加フォーム */}
          <form onSubmit={handleCreateAnnouncement} className="space-y-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
            <h5 className="font-bold text-xs text-teal-800 flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" />
              新しいお知らせを投稿する
            </h5>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-1">タイトル（例: 📢 アップデート、✨ 新機能）</label>
                <input
                  type="text"
                  value={announceTitle}
                  onChange={(e) => setAnnounceTitle(e.target.value)}
                  placeholder="タイトルを入力..."
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-1">お知らせ内容（本文）</label>
                <textarea
                  value={announceText}
                  onChange={(e) => setAnnounceText(e.target.value)}
                  placeholder="お知らせの詳細内容を記述してください..."
                  rows={3}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white resize-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-1">表示日付（例: YYYY/MM/DD）</label>
                <input
                  type="text"
                  value={announceDate}
                  onChange={(e) => setAnnounceDate(e.target.value)}
                  placeholder="2026/06/03"
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                />
              </div>
            </div>

            {announceMsg && (
              <div className={`p-2.5 rounded-xl text-[11px] leading-snug font-semibold ${announceMsg.isError ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
                {announceMsg.text}
              </div>
            )}

            <button
              type="submit"
              disabled={isAnnounceLoading}
              className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {isAnnounceLoading ? (
                <span>配信中...</span>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>お知らせを配信・データベースに保存</span>
                </>
              )}
            </button>
          </form>

          {/* 右カラム：配信済みリスト */}
          <div className="space-y-3">
            <h5 className="font-bold text-xs text-gray-400 flex items-center gap-1">
              <span>現在配信中のお知らせ一覧</span>
              <span className="text-[10px] bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded-full font-bold">{announcements.length} 件</span>
            </h5>

            <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
              {announcements.length === 0 ? (
                <p className="text-center text-xs text-gray-400 py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  配信中のお知らせはまだありません。
                </p>
              ) : (
                announcements.map((ann) => (
                  <div key={ann.id} className="p-3 bg-white border border-slate-100 hover:border-teal-100 rounded-xl flex items-start justify-between gap-3 shadow-sm transition-all">
                    <div className="space-y-1 min-w-0">
                      <p className="font-bold text-xs text-slate-800">{ann.title}</p>
                      <p className="text-[11px] text-slate-600 leading-normal">{ann.text}</p>
                      <span className="text-[9px] text-slate-400 font-bold block">{ann.date}</span>
                    </div>
                    <button
                      onClick={(e) => handleDeleteAnnouncement(ann.id, e)}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg hover:text-rose-700 transition-colors shrink-0 cursor-pointer relative z-10"
                      title="削除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* History table */}
      <div className="bg-white rounded-3xl border border-teal-50 shadow-xl overflow-hidden">
        <div className="p-5 bg-slate-50 border-b border-light-100 flex items-center justify-between">
          <h4 className="font-bold text-gray-800 text-sm">最新解答ログ (最大1500件)</h4>
          <span className="text-[10px] text-teal-600 font-bold">解答日時順（降順表示）</span>
        </div>

        {loading ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-3 border-teal-200 border-t-teal-500 rounded-full animate-spin mx-auto mb-3" />
            <span className="text-xs text-gray-400 font-bold">データを抽出中...</span>
          </div>
        ) : records.length === 0 ? (
          <div className="py-20 text-center text-xs text-gray-400">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            まだ全解答データが存在しないか、接続に問題があります。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 font-semibold text-gray-500">
                  <th className="p-4">解答日時</th>
                  <th className="p-4">ユーザーメール</th>
                  <th className="p-4 text-center">問題ID</th>
                  <th className="p-4">出題分野</th>
                  <th className="p-4 text-center">結果</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r, idx) => (
                  <tr key={r.id || idx} className="hover:bg-teal-50/10 transition-colors">
                    <td className="p-4 font-medium text-gray-500">
                      {r.timestamp instanceof Date ? r.timestamp.toLocaleString('ja-JP') : String(r.timestamp)}
                    </td>
                    <td className="p-4 font-bold text-teal-900 select-all font-mono truncate max-w-[150px]" title={r.userEmail}>
                      {r.userEmail}
                    </td>
                    <td className="p-4 text-center font-bold text-gray-600">
                      <span>No.{r.problemId}</span>
                      {r.isAiQuestion && (
                        <span className="ml-1 bg-amber-100 text-amber-800 text-[9px] font-black px-1.5 py-0.5 rounded-md animate-pulse inline-block">
                          AI
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <span className="bg-teal-50 text-teal-800 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                        {r.field}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      {r.isCorrect ? (
                        <span className="bg-emerald-50 text-emerald-800 px-2.5 py-0.5 rounded-xl font-bold border border-emerald-100 inline-block text-[10px]">
                          正解
                        </span>
                      ) : (
                        <span className="bg-rose-50 text-rose-800 px-2.5 py-0.5 rounded-xl font-bold border border-rose-100 inline-block text-[10px]">
                          不正解
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
