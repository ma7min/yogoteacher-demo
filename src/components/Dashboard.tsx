import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, Sparkles, RotateCcw, AlertCircle, HelpCircle, GraduationCap, ChevronRight, CheckCircle2, Award, ClipboardList, Target, FileText, Shuffle, RefreshCw } from 'lucide-react';
import { MainMode, Question } from '../types';

import { ExamCountdown } from './ExamCountdown';
import { db } from '../lib/firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';

// カスタムSVGドーナツチャート（グレー背景固定、色付き部分がアニメーション）
function AnimatedDoughnut({ correct, incorrect, total, animKey }: { correct: number; incorrect: number; total: number; animKey: string | number }) {
  const size = 80;
  const strokeWidth = 10;
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  const pctCorrect = total > 0 ? correct / total : 0;
  const pctIncorrect = total > 0 ? incorrect / total : 0;

  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const duration = 900;

  useEffect(() => {
    setProgress(0);
    startRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const animate = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(elapsed / duration, 1);
      // easeInOutQuart
      const eased = t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
      setProgress(eased);
      if (t < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [animKey]);

  const correctLen = pctCorrect * circ * progress;
  const incorrectLen = pctIncorrect * circ * progress;
  // 正解セグメント: 12時から時計回り
  const incorrectOffset = circ - correctLen;
  // 不正解セグメント: 正解の直後から
  const incorrectStart = pctCorrect * circ * progress;

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      {/* グレー背景（常時表示） */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth} />
      {/* 不正解（ピンク）: 正解の後ろに配置 */}
      {incorrectLen > 0 && (
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke="#ff6f94" strokeWidth={strokeWidth}
          strokeDasharray={`${incorrectLen} ${circ - incorrectLen}`}
          strokeDashoffset={circ - incorrectStart}
          strokeLinecap="butt"
        />
      )}
      {/* 正解（ティール）: 先頭から */}
      {correctLen > 0 && (
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke="#1ec4b6" strokeWidth={strokeWidth}
          strokeDasharray={`${correctLen} ${circ - correctLen}`}
          strokeDashoffset={0}
          strokeLinecap="butt"
        />
      )}
    </svg>
  );
}


interface DashboardProps {
  onModeSelect: (mode: MainMode) => void;
  onResumeQuiz?: () => void;
  hasSavedSession?: boolean;
  questions: Question[];
  answerHistory: Record<string | number, boolean>;
  attemptsHistory?: Record<string | number, boolean[]>;
  answerTimestamps?: Record<string | number, number>;
  todayStats: { attempted: number; correct: number };
  userProfile?: { grade: string; department: string; diaryName: string } | null;
  onTriggerAdvice: () => void;
  adviceText: string | null;
  adviceLoading: boolean;
  onStartRandom?: (count: number) => void;
  activeTab: 'home' | 'study' | 'analysis';
  onStartSingleQuestion?: (question: Question) => void;
  onRefreshHistory?: () => void;
  isSyncingHistory?: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({
  onModeSelect,
  onResumeQuiz,
  hasSavedSession,
  questions,
  answerHistory,
  attemptsHistory = {},
  answerTimestamps = {},
  todayStats,
  userProfile,
  onTriggerAdvice,
  adviceText,
  adviceLoading,
  onStartRandom,
  activeTab,
  onStartSingleQuestion,
  onRefreshHistory,
  isSyncingHistory = false
}) => {
  const [analysisType, setAnalysisType] = useState<'past' | 'expected' | 'ai'>('past');
  const [showUnattempted, setShowUnattempted] = useState(true);
  const [topFriends, setTopFriends] = useState<any[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Build daily activity map from answerTimestamps: { 'YYYY-MM-DD': count }
  const dailyActivityMap = React.useMemo(() => {
    const map: Record<string, number> = {};
    Object.values(answerTimestamps).forEach(ts => {
      const d = new Date(ts);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [answerTimestamps]);

  React.useEffect(() => {
    const fetchTopFriends = async () => {
      if (!db || activeTab !== 'home') return;
      try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, orderBy('points.weekly', 'desc'), limit(3));
        const snap = await getDocs(q);
        setTopFriends(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error(err);
      }
    };
    fetchTopFriends();
  }, [activeTab]);

  // Stats calculation
  const totalQuestions = questions.length;
  const answeredIds = Object.keys(answerHistory);
  
  // 履歴の中に存在する有効な問題のみを集計
  const activeAnswered = answeredIds.filter(id => questions.some(q => String(q.id) === id));
  const correctCount = activeAnswered.filter(id => answerHistory[id] === true).length;
  const incorrectCount = activeAnswered.filter(id => answerHistory[id] === false).length;
  const unattemptedCount = Math.max(0, totalQuestions - activeAnswered.length);

  const accuracyRate = activeAnswered.length > 0 ? (correctCount / activeAnswered.length) * 100 : 0;

  // のべ解答数（何回問題を解いたかの総演習カウント）
  const attemptsCount = Object.values(attemptsHistory).reduce<number>((sum, arr) => {
    return sum + (Array.isArray(arr) ? arr.length : 1);
  }, 0);
  const totalExercisesCount = Math.max(attemptsCount, activeAnswered.length);

  // Filtered questions based on the selected type for category breakdown
  const typeFilteredQuestions = questions.filter(q => {
    if (analysisType === 'past') {
      return q.year !== '予想問題' && q.year !== 'AI予想問題';
    } else if (analysisType === 'expected') {
      return q.year === '予想問題';
    } else {
      return q.year === 'AI予想問題';
    }
  });

  const typeTotalQuestions = typeFilteredQuestions.length;
  const typeActiveAnswered = answeredIds.filter(id => typeFilteredQuestions.some(q => String(q.id) === id));
  const typeCorrectCount = typeActiveAnswered.filter(id => answerHistory[id] === true).length;
  const typeIncorrectCount = typeActiveAnswered.filter(id => answerHistory[id] === false).length;
  const typeUnattemptedCount = Math.max(0, typeTotalQuestions - typeActiveAnswered.length);

  // Breakdown by field for the selected category type
  const fields = Array.from(new Set(typeFilteredQuestions.map(q => q.field || '未分類')));
  const fieldStats = fields.map(field => {
    const fieldQuestions = typeFilteredQuestions.filter(q => (q.field || '未分類') === field);
    const fieldQuestionsIds = fieldQuestions.map(q => String(q.id));
    
    const fieldAttempted = typeActiveAnswered.filter(id => fieldQuestionsIds.includes(id));
    const fieldCorrect = fieldAttempted.filter(id => answerHistory[id] === true).length;
    const fieldIncorrect = fieldAttempted.filter(id => answerHistory[id] === false).length;
    const fieldUnattempted = Math.max(0, fieldQuestions.length - fieldAttempted.length);
    
    const accuracy = fieldAttempted.length > 0 
      ? Math.round((fieldCorrect / fieldAttempted.length) * 100) 
      : 0;

    return {
      name: field,
      total: fieldQuestions.length,
      correct: fieldCorrect,
      incorrect: fieldIncorrect,
      unattempted: fieldUnattempted,
      attempted: fieldAttempted.length,
      accuracy
    };
  }).filter(stat => stat.total > 0);

  // Simple Markdown-to-HTML parser helper for AI advice
  const parseMarkdownHtml = (text: string) => {
    if (!text) return '';
    return text
      .replace(/### (.*?)\n/g, '<h4 class="font-bold text-teal-800 text-sm mt-3 mb-1">$1</h4>')
      .replace(/## (.*?)\n/g, '<h3 class="font-bold text-teal-900 text-base mt-4 mb-2 border-b border-teal-100 pb-1">$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-teal-900">$1</strong>')
      .replace(/- (.*?)\n/g, '<li class="list-disc ml-5 text-gray-700 text-xs my-1">$1</li>')
      .replace(/\n\n/g, '<p class="my-2 text-xs text-gray-700 leading-relaxed"></p>')
      .replace(/\n/g, '<br/>');
  };

  // Circular progress stroke calculation
  const radius = 40;
  const circumference = 2 * Math.PI * radius;

  const pctTotalAttempted = totalQuestions > 0 ? activeAnswered.length / totalQuestions : 0;
  const pctTotalCorrect = totalQuestions > 0 ? correctCount / totalQuestions : 0;

  const strokeDashoffsetTotalAttempted = circumference - pctTotalAttempted * circumference;
  const strokeDashoffsetTotalCorrect = circumference - pctTotalCorrect * circumference;

  const TODAY_GOAL = 10; const pctTodayAttempted = Math.min(todayStats.attempted / TODAY_GOAL, 1);
  const pctTodayCorrect = Math.min(todayStats.correct / TODAY_GOAL, 1);
  const strokeDashoffsetTodayAttempted = circumference - pctTodayAttempted * circumference;
  const strokeDashoffsetTodayCorrect = circumference - pctTodayCorrect * circumference;

  return (
    <div className="space-y-8 pb-20">
      <AnimatePresence mode="wait">
        {activeTab === 'home' && (
          <motion.div
            key="home"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            <ExamCountdown />
            {/* Welcome Board */}
            {hasSavedSession ? (
              <div className="p-6 bg-gradient-to-r from-amber-500 to-orange-400 rounded-3xl shadow-lg shadow-amber-500/10 text-white flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="space-y-2 text-center md:text-left">
                  <div className="flex items-center justify-center md:justify-start gap-2">
                    <RotateCcw className="w-8 h-8" />
                    <h3 className="text-xl font-bold tracking-tight">
                      {userProfile?.diaryName ? `おかえりなさい、${userProfile.diaryName} さん🌸` : "前回の続きから再開できます"}
                    </h3>
                  </div>
                  {userProfile && (
                    <div className="inline-flex gap-2 items-center bg-white/15 px-3 py-1 rounded-full text-xs font-semibold text-amber-50 backdrop-blur-sm">
                      <span>{userProfile.grade || '未設定'}</span>
                      <span className="w-1 h-1 bg-white/40 rounded-full" />
                      <span>{userProfile.department || '未設定'}</span>
                    </div>
                  )}
                  <p className="text-amber-50 text-sm leading-relaxed max-w-xl pt-1">
                    前回途中で中断した問題演習の記録が残っています。再開して続きを完了させましょう！
                  </p>
                </div>
                <div className="flex gap-3 items-center shrink-0">
                  <button
                    onClick={() => onModeSelect('past')}
                    className="px-4 py-2.5 bg-white/20 hover:bg-white/30 text-white font-bold rounded-xl transition-colors text-sm cursor-pointer"
                  >
                    新しく始める
                  </button>
                  <button
                    onClick={onResumeQuiz}
                    className="px-6 py-3.5 bg-white text-amber-700 font-bold rounded-2xl flex items-center gap-2 hover:bg-amber-50 shadow-md shadow-amber-900/10 transition-all transform hover:scale-105 cursor-pointer text-sm"
                  >
                    前回の続きから再開する
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 bg-gradient-to-r from-teal-500 to-teal-500 rounded-3xl shadow-lg shadow-teal-500/10 text-white flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="space-y-2 text-center md:text-left">
                  <div className="flex items-center justify-center md:justify-start gap-2">
                    <GraduationCap className="w-8 h-8" />
                    <h3 className="text-xl font-bold tracking-tight">
                      {userProfile?.diaryName ? `ようこそ、${userProfile.diaryName} さん🌸` : "学びを、あなたのペースで。"}
                    </h3>
                  </div>
                  {userProfile && (
                    <div className="inline-flex gap-2 items-center bg-white/15 px-3 py-1 rounded-full text-xs font-semibold text-teal-50 backdrop-blur-sm">
                      <span>{userProfile.grade || '未設定'}</span>
                      <span className="w-1 h-1 bg-white/40 rounded-full" />
                      <span>{userProfile.department || '未設定'}</span>
                    </div>
                  )}
                  <p className="text-teal-50 text-xs leading-relaxed max-w-xl pt-1">
                    養護教諭採用試験（専門教養）合格に向けて、過去問題を集中的に演習しましょう。AI予想問題の生成やアドバイスシステムがあなたの合格を全力で応援します。
                  </p>
                </div>
                <div className="flex flex-row flex-nowrap items-center justify-center md:justify-start gap-2 sm:gap-3 shrink-0">
                  <button
                    onClick={() => onStartRandom && onStartRandom(5)}
                    className="px-4 sm:px-5 py-3.5 bg-white text-teal-700 font-extrabold rounded-xl sm:rounded-2xl flex items-center justify-center gap-1.5 hover:bg-teal-50 active:scale-95 shadow-lg shadow-teal-900/15 transition-all duration-150 cursor-pointer text-sm"
                  >
                    <Shuffle className="w-4 h-4" />
                    ランダムで5問出題
                  </button>
                  <button
                    onClick={() => onStartRandom && onStartRandom(10)}
                    className="px-4 sm:px-5 py-3.5 bg-white text-teal-700 font-extrabold rounded-xl sm:rounded-2xl flex items-center justify-center gap-1.5 hover:bg-teal-50 active:scale-95 shadow-lg shadow-teal-900/15 transition-all duration-150 cursor-pointer text-sm"
                  >
                    <Shuffle className="w-4 h-4" />
                    ランダムで10問出題
                  </button>
                </div>
              </div>
            )}

            {/* Stats Cards Section - Added to Home Tab as well */}
            <div className="grid grid-cols-2 gap-3 sm:gap-6">
              {/* Progress Circular Graph Card */}
              <div className="bg-white p-3 sm:p-4 rounded-2xl sm:rounded-3xl border border-teal-50/50 shadow-xl flex flex-col items-center justify-between relative min-h-[210px] sm:min-h-[235px]">
                <div className="flex items-center justify-between w-full mb-1 sm:mb-2">
                  <h4 className="font-bold text-gray-800 text-xs sm:text-xs flex items-center gap-1">
                    <span>総学習達成度</span>
                  </h4>
                  {onRefreshHistory && (
                    <button
                      onClick={onRefreshHistory}
                      disabled={isSyncingHistory}
                      title="クラウドの解答履歴を再読み込み"
                      className="p-1 text-teal-600 hover:text-teal-800 hover:bg-teal-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1 text-xs font-bold"
                    >
                      <RefreshCw className={`w-3 h-3 ${isSyncingHistory ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">再同期</span>
                    </button>
                  )}
                </div>
                
                <div className="relative flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 my-1">
                  <AnimatedDoughnut correct={correctCount} incorrect={incorrectCount} total={totalQuestions} animKey={activeTab} />
                  <div className="absolute text-center flex flex-col items-center justify-center pointer-events-none mt-0.5">
                    <span className="text-xs font-bold text-gray-400 leading-none">正答率</span>
                    <span className="text-sm sm:text-base font-black text-[#1ec4b6] tracking-tight leading-tight">
                      {activeAnswered.length > 0 ? Math.round(accuracyRate) : 0}
                      <span className="text-xs sm:text-xs font-bold">%</span>
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1 w-full pt-2 border-t border-slate-50 text-xs sm:text-xs font-bold text-gray-500">
                  {/* 総演習回数ハイライト */}
                  <div className="flex justify-between items-center bg-teal-50/80 px-2 py-1 rounded-lg text-teal-900 border border-teal-100/60">
                    <span className="text-xs sm:text-xs font-black text-teal-800">総演習数</span>
                    <span className="font-black text-xs sm:text-sm text-teal-700">
                      {totalExercisesCount} <span className="text-xs font-normal text-teal-600">問</span>
                    </span>
                  </div>

                  <div className="flex justify-between items-center px-0.5 pt-0.5">
                    <span className="text-[#1ec4b6]">正解(習得)</span>
                    <span className="text-[#1ec4b6] font-black text-xs sm:text-sm">{correctCount}問</span>
                  </div>
                  <div className="flex justify-between items-center px-0.5">
                    <span className="text-[#ff6f94]">不正解</span>
                    <span className="text-[#ff6f94] font-black text-xs sm:text-sm">{incorrectCount}問</span>
                  </div>
                  <div className="flex justify-between items-center px-0.5">
                    <span className="text-[#99a1af]">未解答</span>
                    <span className="text-[#99a1af] font-black text-xs sm:text-sm">{unattemptedCount}問</span>
                  </div>
                  <div className="mt-1 pt-1 border-t border-dashed border-slate-200 flex justify-between items-center text-xs sm:text-xs text-gray-400 leading-tight">
                    <span>カバー率: <strong className="text-gray-600">{((activeAnswered.length / totalQuestions) * 100).toFixed(0)}%</strong></span>
                    <span>全 <strong className="text-gray-600">{totalQuestions}問</strong></span>
                  </div>
                </div>
              </div>

              {/* Today's Stats Card */}
              <div className="bg-white p-3 sm:p-4 rounded-2xl sm:rounded-3xl border border-teal-50/50 shadow-xl flex flex-col items-center justify-center relative min-h-[190px] sm:min-h-[220px]">
                <h4 className="font-bold text-gray-800 text-xs sm:text-xs mb-2 sm:mb-3 text-center">今日の達成度</h4>
                
                <div className="relative flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20">
                  <AnimatedDoughnut correct={todayStats.correct} incorrect={Math.max(0, todayStats.attempted - todayStats.correct)} total={10} animKey={activeTab} />
                  <div className="absolute text-center flex flex-col items-center justify-center mt-0.5">
                    <span className="text-sm sm:text-base font-black text-[#1ec4b6] tracking-tight leading-none">
                      {todayStats.attempted}
                      <span className="text-xs sm:text-xs font-bold">問</span>
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-1 w-full pt-2.5 sm:pt-3 border-t border-slate-50 text-xs sm:text-xs font-bold text-gray-500">
                  <div className="flex justify-between items-center">
                    <span className="text-[#1ec4b6]">正解</span>
                    <span className="text-[#1ec4b6] font-black text-xs sm:text-sm">{todayStats.correct}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#ff6f94]">不正解</span>
                    <span className="text-[#ff6f94] font-black text-xs sm:text-sm">{todayStats.attempted - todayStats.correct}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#99a1af]">解答数</span>
                    <span className="text-[#99a1af] font-black text-xs sm:text-sm">{todayStats.attempted}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Top Friends Section */}
            {topFriends.length > 0 && (
              <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-teal-50/50 shadow-xl">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                    <Award className="w-5 h-5 text-amber-500" /> 今週のトップフレンド
                  </h4>
                </div>
                <div className="space-y-3">
                  {topFriends.map((friend, idx) => (
                    <div key={friend.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-8 flex justify-center text-lg">
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                        </div>
                        <div>
                          <p className="font-bold text-slate-700 text-sm">{friend.diaryName || '匿名ユーザー'}</p>
                          <p className="text-xs text-slate-400">🔥 連続 {friend.streakDays || 0}日</p>
                        </div>
                      </div>
                      <div className="font-black text-teal-600">
                        {friend.points?.weekly || 0} <span className="text-xs font-normal">pt</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'study' && (
          <motion.div
            key="study"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            {/* Dashboard Grid Shortcuts */}
            <div className="bg-white p-6 rounded-3xl border border-teal-50/50 shadow-xl flex flex-col justify-between">
              <div>
                <h4 className="font-bold text-gray-800 text-sm mb-4">学習モードの選択</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-4">
                  <button
                    onClick={() => onStartRandom && onStartRandom(5)}
                    className="p-5 bg-teal-50/40 hover:bg-teal-50 border-2 border-teal-100/50 hover:border-teal-400 rounded-2xl flex flex-col items-center gap-3 transition-all text-center cursor-pointer group"
                  >
                    <div className="w-12 h-12 bg-white rounded-xl shadow-sm text-teal-600 flex items-center justify-center font-bold font-mono group-hover:scale-110 transition-transform">
                      <Shuffle className="w-6 h-6" />
                    </div>
                    <span className="font-extrabold text-sm text-teal-900">ランダム5問</span>
                    <span className="text-xs text-teal-600 leading-relaxed font-semibold">未解答や苦手から優先出題</span>
                  </button>

                  <button
                    onClick={() => onStartRandom && onStartRandom(10)}
                    className="p-5 bg-teal-50/40 hover:bg-teal-50 border-2 border-teal-100/50 hover:border-teal-400 rounded-2xl flex flex-col items-center gap-3 transition-all text-center cursor-pointer group"
                  >
                    <div className="w-12 h-12 bg-white rounded-xl shadow-sm text-teal-600 flex items-center justify-center font-bold font-mono group-hover:scale-110 transition-transform">
                      <Shuffle className="w-6 h-6" />
                    </div>
                    <span className="font-extrabold text-sm text-teal-900">ランダム10問</span>
                    <span className="text-xs text-teal-600 leading-relaxed font-semibold">未解答や苦手から優先出題</span>
                  </button>

                  <button
                    onClick={() => onModeSelect('past')}
                    className="p-5 bg-teal-50/40 hover:bg-teal-50 border-2 border-teal-100/50 hover:border-teal-400 rounded-2xl flex flex-col items-center gap-3 transition-all text-center cursor-pointer group"
                  >
                    <div className="w-12 h-12 bg-white rounded-xl shadow-sm text-teal-600 flex items-center justify-center font-bold font-mono group-hover:scale-110 transition-transform">
                      <BookOpen className="w-6 h-6" />
                    </div>
                    <span className="font-extrabold text-sm text-teal-900">過去問を解く</span>
                    <span className="text-xs text-teal-600 leading-relaxed font-semibold">自治体・分野・年度ごとに解く</span>
                  </button>

                  <button
                    onClick={() => onModeSelect('expected')}
                    className="p-5 bg-orange-50/40 hover:bg-orange-50 border-2 border-orange-100/50 hover:border-orange-400 rounded-2xl flex flex-col items-center gap-3 transition-all text-center cursor-pointer group"
                  >
                    <div className="w-12 h-12 bg-white rounded-xl shadow-sm text-orange-600 flex items-center justify-center font-bold font-mono group-hover:scale-110 transition-transform">
                      <Target className="w-6 h-6" />
                    </div>
                    <span className="font-extrabold text-sm text-orange-900">予想問題</span>
                    <span className="text-xs text-orange-600 leading-relaxed font-semibold">出題予想される問題を解く</span>
                  </button>

                  <button
                    onClick={() => onModeSelect('ai')}
                    className="p-5 bg-gradient-to-br from-teal-50/20 to-indigo-50/10 hover:to-indigo-50/40 border-2 border-indigo-100/30 hover:border-indigo-400 rounded-2xl flex flex-col items-center gap-3 transition-all text-center cursor-pointer group"
                  >
                    <div className="w-12 h-12 bg-white rounded-xl shadow-sm text-indigo-600 flex items-center justify-center font-bold font-mono group-hover:scale-110 transition-transform">
                      <Sparkles className="w-6 h-6 animate-spin-slow" />
                    </div>
                    <span className="font-extrabold text-sm text-indigo-900">AI予想問題</span>
                    <span className="text-xs text-indigo-600 leading-relaxed font-semibold">Geminiが作成した予想問題</span>
                  </button>

                  <button
                    onClick={() => onModeSelect('review')}
                    className="p-5 bg-[#ff6f94]/5 hover:bg-[#ff6f94]/10 border-2 border-[#ff6f94]/20 hover:border-[#ff6f94]/50 rounded-2xl flex flex-col items-center gap-3 transition-all text-center cursor-pointer group"
                  >
                    <div className="w-12 h-12 bg-white rounded-xl shadow-sm text-[#ff6f94] flex items-center justify-center font-bold font-mono group-hover:scale-110 transition-transform">
                      <RotateCcw className="w-6 h-6" />
                    </div>
                    <span className="font-extrabold text-sm text-[#a7455e]">苦手克服</span>
                    <span className="text-xs text-[#ff6f94] leading-relaxed font-semibold">間違えた問題をランダムに出題</span>
                  </button>

                  <button
                    onClick={() => onModeSelect('report')}
                    className="p-5 bg-amber-50/25 hover:bg-amber-50 border-2 border-amber-100/30 hover:border-amber-400 rounded-2xl flex flex-col items-center gap-3 transition-all text-center cursor-pointer group"
                  >
                    <div className="w-12 h-12 bg-white rounded-xl shadow-sm text-amber-600 flex items-center justify-center font-bold font-mono group-hover:scale-110 transition-transform">
                      <ClipboardList className="w-6 h-6" />
                    </div>
                    <span className="font-extrabold text-sm text-amber-900">レポート</span>
                    <span className="text-xs text-amber-600 leading-relaxed font-semibold">全体の成績分析と問題アーカイブ</span>
                  </button>

                  <button
                    onClick={() => onModeSelect('pdf-maker')}
                    className="p-5 bg-pink-50/40 hover:bg-pink-50 border-2 border-pink-100/50 hover:border-pink-400 rounded-2xl flex flex-col items-center gap-3 transition-all text-center cursor-pointer group"
                  >
                    <div className="w-12 h-12 bg-white rounded-xl shadow-sm text-pink-600 flex items-center justify-center font-bold font-mono group-hover:scale-110 transition-transform">
                      <FileText className="w-6 h-6" />
                    </div>
                    <span className="font-extrabold text-sm text-pink-900">自作問題 (PDF・画像)</span>
                    <span className="text-xs text-pink-600 leading-relaxed font-semibold">資料や写真を読み込んで問題化</span>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'analysis' && (
          <motion.div
            key="analysis"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            {/* Stats Cards Section */}
            <div className="grid grid-cols-2 gap-3 sm:gap-6">
              {/* Progress Circular Graph Card */}
              <div className="bg-white p-3 sm:p-4 rounded-2xl sm:rounded-3xl border border-teal-50/50 shadow-xl flex flex-col items-center justify-between relative min-h-[210px] sm:min-h-[235px]">
                <div className="flex items-center justify-between w-full mb-1 sm:mb-2">
                  <h4 className="font-bold text-gray-800 text-xs sm:text-xs flex items-center gap-1">
                    <span>総学習達成度</span>
                  </h4>
                  {onRefreshHistory && (
                    <button
                      onClick={onRefreshHistory}
                      disabled={isSyncingHistory}
                      title="クラウドの解答履歴を再読み込み"
                      className="p-1 text-teal-600 hover:text-teal-800 hover:bg-teal-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1 text-xs font-bold"
                    >
                      <RefreshCw className={`w-3 h-3 ${isSyncingHistory ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">再同期</span>
                    </button>
                  )}
                </div>
                
                <div className="relative flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 my-1">
                  <AnimatedDoughnut correct={correctCount} incorrect={incorrectCount} total={totalQuestions} animKey={activeTab} />
                  <div className="absolute text-center flex flex-col items-center justify-center pointer-events-none mt-0.5">
                    <span className="text-xs font-bold text-gray-400 leading-none">正答率</span>
                    <span className="text-sm sm:text-base font-black text-[#1ec4b6] tracking-tight leading-tight">
                      {activeAnswered.length > 0 ? Math.round(accuracyRate) : 0}
                      <span className="text-xs sm:text-xs font-bold">%</span>
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1 w-full pt-2 border-t border-slate-50 text-xs sm:text-xs font-bold text-gray-500">
                  {/* 総演習回数ハイライト */}
                  <div className="flex justify-between items-center bg-teal-50/80 px-2 py-1 rounded-lg text-teal-900 border border-teal-100/60">
                    <span className="text-xs sm:text-xs font-black text-teal-800">総演習数</span>
                    <span className="font-black text-xs sm:text-sm text-teal-700">
                      {totalExercisesCount} <span className="text-xs font-normal text-teal-600">問</span>
                    </span>
                  </div>

                  <div className="flex justify-between items-center px-0.5 pt-0.5">
                    <span className="text-[#1ec4b6]">正解(習得)</span>
                    <span className="text-[#1ec4b6] font-black text-xs sm:text-sm">{correctCount}問</span>
                  </div>
                  <div className="flex justify-between items-center px-0.5">
                    <span className="text-[#ff6f94]">不正解</span>
                    <span className="text-[#ff6f94] font-black text-xs sm:text-sm">{incorrectCount}問</span>
                  </div>
                  <div className="flex justify-between items-center px-0.5">
                    <span className="text-[#99a1af]">未解答</span>
                    <span className="text-[#99a1af] font-black text-xs sm:text-sm">{unattemptedCount}問</span>
                  </div>
                  <div className="mt-1 pt-1 border-t border-dashed border-slate-200 flex justify-between items-center text-xs sm:text-xs text-gray-400 leading-tight">
                    <span>カバー率: <strong className="text-gray-600">{((activeAnswered.length / totalQuestions) * 100).toFixed(0)}%</strong></span>
                    <span>全 <strong className="text-gray-600">{totalQuestions}問</strong></span>
                  </div>
                </div>
              </div>

              {/* Today's Stats Card */}
              <div className="bg-white p-3 sm:p-4 rounded-2xl sm:rounded-3xl border border-teal-50/50 shadow-xl flex flex-col items-center justify-center relative min-h-[190px] sm:min-h-[220px]">
                <h4 className="font-bold text-gray-800 text-xs sm:text-xs mb-2 sm:mb-3 text-center">今日の達成度</h4>
                
                <div className="relative flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20">
                  <AnimatedDoughnut correct={todayStats.correct} incorrect={Math.max(0, todayStats.attempted - todayStats.correct)} total={10} animKey={activeTab} />
                  <div className="absolute text-center flex flex-col items-center justify-center mt-0.5">
                    <span className="text-sm sm:text-base font-black text-[#1ec4b6] tracking-tight leading-none">
                      {todayStats.attempted}
                      <span className="text-xs sm:text-xs font-bold">問</span>
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-1 w-full pt-2.5 sm:pt-3 border-t border-slate-50 text-xs sm:text-xs font-bold text-gray-500">
                  <div className="flex justify-between items-center">
                    <span className="text-[#1ec4b6]">正解</span>
                    <span className="text-[#1ec4b6] font-black text-xs sm:text-sm">{todayStats.correct}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#ff6f94]">不正解</span>
                    <span className="text-[#ff6f94] font-black text-xs sm:text-sm">{todayStats.attempted - todayStats.correct}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#99a1af]">解答数</span>
                    <span className="text-[#99a1af] font-black text-xs sm:text-sm">{todayStats.attempted}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Advice Center - Heartful integration */}
            <div className="bg-white p-6 rounded-3xl border border-teal-50/50 shadow-xl space-y-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-gradient-to-r from-teal-500 to-teal-500 text-white rounded-lg">
                  <Sparkles className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-gray-800 text-sm">AI分析</h4>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Gemini 3.5-flashがあなたの解答履歴を高度に分析。正答状況、得意・苦手傾向に合わせて、合格へと導くプロフェッショナルな学習プランと励ましのメッセージを即座に生成します。
              </p>

              <button
                onClick={onTriggerAdvice}
                disabled={adviceLoading}
                className="w-full py-4 bg-gradient-to-r from-teal-500 to-teal-500 hover:from-teal-600 hover:to-teal-600 text-white font-extrabold rounded-2xl shadow-md shadow-teal-500/10 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 text-sm"
              >
                {adviceLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    AIによる傾向分析中...
                  </>
                ) : (
                  <>
                    <HelpCircle className="w-4 h-4" />
                    AI学習アドバイスを生成・更新する
                  </>
                )}
              </button>

              {/* Display Advice with high style */}
              <AnimatePresence>
                {adviceText && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 bg-teal-50/30 border border-teal-100 rounded-2xl p-5 relative overflow-hidden"
                  >
                    {/* Decorative Watermark */}
                    <div className="absolute right-4 bottom-4 text-teal-100 opacity-20 pointer-events-none">
                      <GraduationCap className="w-24 h-24" />
                    </div>
                    
                    <div className="flex items-center gap-2 border-b border-teal-100 pb-3 mb-3">
                      <Award className="w-5 h-5 text-teal-600" />
                      <span className="font-bold text-xs text-teal-800 uppercase tracking-widest">
                        AIアドバイザー からのアドバイス
                      </span>
                    </div>

                    {/* Parsed Advice body */}
                    <div
                      className="text-xs text-slate-700 leading-relaxed space-y-2 prose"
                      dangerouslySetInnerHTML={{ __html: parseMarkdownHtml(adviceText) }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Field Weakness/Strength breakdown table */}
            <div className="bg-white p-5 sm:p-6 rounded-3xl border border-teal-50/50 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                <h4 className="font-bold text-gray-800 text-sm">分野別の正答状況</h4>
                
                {/* Mode Selector for Categories */}
                <div className="flex bg-slate-100 p-1 rounded-xl self-start sm:self-auto border border-slate-200/50">
                  <button
                    onClick={() => setAnalysisType('past')}
                    className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                      analysisType === 'past'
                        ? 'bg-white text-teal-800 shadow-sm'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    <BookOpen className="w-3 h-3 text-teal-600" />
                    <span>過去問</span>
                  </button>
                  <button
                    onClick={() => setAnalysisType('expected')}
                    className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                      analysisType === 'expected'
                        ? 'bg-white text-teal-800 shadow-sm'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    <Target className="w-3 h-3 text-rose-500" />
                    <span>予想問題</span>
                  </button>
                  <button
                    onClick={() => setAnalysisType('ai')}
                    className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                      analysisType === 'ai'
                        ? 'bg-white text-teal-800 shadow-sm'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    <Sparkles className="w-3 h-3 text-amber-500 animate-pulse" />
                    <span>AI問題</span>
                  </button>
                </div>
              </div>

              {/* Stacked Progress Bar Legend */}
              <div className="flex items-center gap-4 text-xs font-bold text-gray-500 bg-slate-50/50 p-2 rounded-xl">
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-[#1ec4b6] inline-block" />
                  <span>正解</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-[#ff6f94] inline-block" />
                  <span>不正解</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-slate-200 inline-block" />
                  <span>未解答</span>
                </div>
              </div>

              <div className="space-y-4">
                {fieldStats.length === 0 ? (
                  <div className="text-center py-8 text-xs text-gray-400 font-bold bg-slate-50/30 rounded-2xl border border-dashed border-slate-200">
                    {analysisType === 'ai' ? (
                      <div>
                        <Sparkles className="w-8 h-8 text-amber-300 mx-auto mb-2 animate-pulse" />
                        <p>AI予想問題の履歴がありません。</p>
                        <p className="text-xs text-gray-400 mt-1">「学んで鍛える」タブからAI問題に挑戦してみましょう！</p>
                      </div>
                    ) : (
                      <p>該当する問題データがありません。</p>
                    )}
                  </div>
                ) : (
                  fieldStats.map(stat => {
                    const pctCorrect = stat.total > 0 ? (stat.correct / stat.total) * 100 : 0;
                    const pctIncorrect = stat.total > 0 ? (stat.incorrect / stat.total) * 100 : 0;
                    const pctUnattempted = stat.total > 0 ? (stat.unattempted / stat.total) * 100 : 0;

                    return (
                      <div key={stat.name} className="space-y-2">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 text-xs">
                          <span className="font-black text-slate-800">{stat.name}</span>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-gray-400 font-bold">
                            <span className="text-[#1ec4b6]">正解: {stat.correct}問</span>
                            <span className="text-gray-300">|</span>
                            <span className="text-[#ff6f94]">不正解: {stat.incorrect}問</span>
                            <span className="text-gray-300">|</span>
                            <span className="text-slate-400">未解答: {stat.unattempted}問</span>
                            <span className="text-gray-300">/</span>
                            <span className="text-slate-600 font-black">合計: {stat.total}問</span>
                            <span className="ml-1 text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">
                              正答率: {stat.accuracy}%
                            </span>
                          </div>
                        </div>

                        {/* Stacked Progress Bar */}
                        <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden flex shadow-inner border border-slate-200/20">
                          {stat.correct > 0 && (
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${pctCorrect}%` }}
                              transition={{ duration: 0.6 }}
                              className="h-full bg-[#1ec4b6]"
                              title={`正解: ${stat.correct}問`}
                            />
                          )}
                          {stat.incorrect > 0 && (
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${pctIncorrect}%` }}
                              transition={{ duration: 0.6 }}
                              className="h-full bg-[#ff6f94]"
                              title={`不正解: ${stat.incorrect}問`}
                            />
                          )}
                          {stat.unattempted > 0 && (
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${pctUnattempted}%` }}
                              transition={{ duration: 0.6 }}
                              className="h-full bg-slate-200"
                              title={`未解答: ${stat.unattempted}問`}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Question Grid Section */}
            <div className="bg-white p-5 sm:p-6 rounded-3xl border border-teal-50/50 shadow-xl space-y-6 mt-6">
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                  問題一覧 
                  <span className="text-gray-400 font-medium text-xs">(全{typeFilteredQuestions.length}問)</span>
                </h4>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-500">未解答を表示</span>
                  <button 
                    onClick={() => setShowUnattempted(!showUnattempted)}
                    className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${showUnattempted ? 'bg-teal-500' : 'bg-slate-300'}`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${showUnattempted ? 'left-5' : 'left-1'}`} />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {typeFilteredQuestions.map((q, idx) => {
                  const status = answerHistory[q.id];
                  const isUnattempted = status === undefined;
                  
                  if (isUnattempted && !showUnattempted) return null;

                  let bgColor = "bg-white border-slate-100 text-slate-700 shadow-sm";
                  let hoverColor = "hover:border-slate-300";
                  
                  if (status === true) {
                    bgColor = "bg-teal-50 border-teal-200 text-teal-800 shadow-sm";
                    hoverColor = "hover:bg-teal-100";
                  } else if (status === false) {
                    bgColor = "bg-rose-50 border-rose-200 text-rose-800 shadow-sm";
                    hoverColor = "hover:bg-rose-100";
                  }

                  return (
                    <button
                      key={q.id}
                      onClick={() => onStartSingleQuestion?.(q)}
                      className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full border flex items-center justify-center font-bold text-sm transition-all cursor-pointer ${bgColor} ${hoverColor} hover:-translate-y-0.5 active:translate-y-0`}
                      title={`${q.field}: No.${q.id}`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
                {typeFilteredQuestions.length === 0 && (
                   <p className="text-xs text-gray-400 w-full text-center py-4">表示できる問題がありません。</p>
                )}
              </div>
              
              {/* Question Grid Legend */}
              <div className="flex justify-center items-center gap-6 text-xs font-bold text-gray-500 pt-2 border-t border-slate-50">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-slate-50 border border-slate-200 inline-block shadow-sm" />
                  <span>未解答</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-teal-50 border border-teal-200 inline-block shadow-sm" />
                  <span>正解</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-rose-50 border border-rose-200 inline-block shadow-sm" />
                  <span>不正解</span>
                </div>
              </div>
            </div>

            {/* Learning Calendar */}
            <div className="bg-white p-5 rounded-3xl border border-teal-50/50 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                  📅 学習カレンダー
                </h4>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCalendarMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-gray-500 transition-colors cursor-pointer"
                  >
                    ‹
                  </button>
                  <span className="text-xs font-black text-teal-700 w-20 text-center">
                    {calendarMonth.getFullYear()}年{calendarMonth.getMonth() + 1}月
                  </span>
                  <button
                    onClick={() => setCalendarMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-gray-500 transition-colors cursor-pointer"
                  >
                    ›
                  </button>
                </div>
              </div>

              {/* Day-of-week headers */}
              <div className="grid grid-cols-7 text-center text-xs font-black text-gray-400 pb-1">
                {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
                  <div key={d} className={i === 0 ? 'text-rose-400' : i === 6 ? 'text-blue-400' : ''}>{d}</div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1">
                {(() => {
                  const year = calendarMonth.getFullYear();
                  const month = calendarMonth.getMonth();
                  const firstDay = new Date(year, month, 1).getDay();
                  const daysInMonth = new Date(year, month + 1, 0).getDate();
                  const todayStr = (() => {
                    const now = new Date();
                    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                  })();
                  const maxCount = Math.max(1, ...Object.values(dailyActivityMap));

                  const cells = [];
                  // leading blanks
                  for (let i = 0; i < firstDay; i++) {
                    cells.push(<div key={`blank-${i}`} />);
                  }
                  for (let day = 1; day <= daysInMonth; day++) {
                    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const count = dailyActivityMap[key] || 0;
                    const isToday = key === todayStr;
                    const intensity = count === 0 ? 0 : Math.ceil((count / maxCount) * 4);
                    const bgClass = count === 0
                      ? 'bg-slate-50 border border-slate-100 text-gray-400'
                      : intensity === 1
                        ? 'bg-teal-100 border border-teal-200 text-teal-700'
                        : intensity === 2
                          ? 'bg-teal-200 border border-teal-300 text-teal-800'
                          : intensity === 3
                            ? 'bg-teal-400 border border-teal-500 text-white'
                            : 'bg-teal-600 border border-teal-700 text-white';
                    cells.push(
                      <div
                        key={key}
                        className={`aspect-square flex flex-col items-center justify-center rounded-lg text-xs font-bold transition-transform hover:scale-110 cursor-default relative ${bgClass} ${isToday ? 'ring-2 ring-amber-400 ring-offset-1' : ''}`}
                        title={count > 0 ? `${month + 1}/${day}: ${count}問解答` : `${month + 1}/${day}`}
                      >
                        <span>{day}</span>
                        {count > 0 && <span className="text-xs font-black leading-none opacity-80">{count}</span>}
                      </div>
                    );
                  }
                  return cells;
                })()}
              </div>

              {/* Legend */}
              <div className="flex items-center justify-between text-xs font-bold text-gray-400 pt-1 border-t border-slate-50">
                <span>少ない</span>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded bg-slate-50 border border-slate-100" />
                  <div className="w-4 h-4 rounded bg-teal-100 border border-teal-200" />
                  <div className="w-4 h-4 rounded bg-teal-200 border border-teal-300" />
                  <div className="w-4 h-4 rounded bg-teal-400 border border-teal-500" />
                  <div className="w-4 h-4 rounded bg-teal-600 border border-teal-700" />
                </div>
                <span>多い</span>
              </div>

              {/* Calendar Summary Stats */}
              {(() => {
                const year = calendarMonth.getFullYear();
                const month = calendarMonth.getMonth();
                const daysInMonth = new Date(year, month + 1, 0).getDate();
                let studyDaysThisMonth = 0;
                let totalAnswersThisMonth = 0;
                for (let day = 1; day <= daysInMonth; day++) {
                  const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const count = dailyActivityMap[key] || 0;
                  if (count > 0) { studyDaysThisMonth++; totalAnswersThisMonth += count; }
                }
                // 連続学習日数（今日を基点に遡る）
                let streak = 0;
                const now = new Date();
                for (let i = 0; i < 365; i++) {
                  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
                  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                  if (dailyActivityMap[key]) { streak++; } else { break; }
                }
                return (
                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100">
                    <div className="bg-teal-50 rounded-xl p-3 text-center">
                      <p className="text-xs font-bold text-teal-600 mb-1">今月の学習日数</p>
                      <p className="text-xl font-black text-teal-700">{studyDaysThisMonth}<span className="text-xs font-bold ml-0.5">日</span></p>
                    </div>
                    <div className="bg-teal-50 rounded-xl p-3 text-center">
                      <p className="text-xs font-bold text-teal-600 mb-1">今月の総解答数</p>
                      <p className="text-xl font-black text-teal-700">{totalAnswersThisMonth}<span className="text-xs font-bold ml-0.5">問</span></p>
                    </div>
                    <div className={`rounded-xl p-3 text-center ${streak >= 3 ? 'bg-amber-50' : 'bg-slate-50'}`}>
                      <p className={`text-xs font-bold mb-1 ${streak >= 3 ? 'text-amber-600' : 'text-gray-400'}`}>連続学習</p>
                      <p className={`text-xl font-black ${streak >= 3 ? 'text-amber-600' : 'text-gray-400'}`}>
                        {streak >= 3 ? '🔥' : ''}{streak}<span className="text-xs font-bold ml-0.5">日</span>
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
