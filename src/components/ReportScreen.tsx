import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Search, BookOpen, AlertCircle, Play, Sparkles, Target, History, Archive, Bookmark } from 'lucide-react';
import { Question, formatKouAndGou } from '../types';

interface ReportScreenProps {
  questions: Question[];
  answerHistory: Record<string | number, boolean>;
  attemptsHistory: Record<string | number, boolean[]>;
  answerTimestamps?: Record<string | number, number>;
  bookmarks?: Set<string | number>;
  onToggleBookmark?: (id: string | number) => void;
  onGoBack: () => void;
  onStartSingleQuestion: (question: Question) => void;
}

export const ReportScreen: React.FC<ReportScreenProps> = ({
  questions,
  answerHistory,
  attemptsHistory,
  answerTimestamps = {},
  bookmarks = new Set(),
  onToggleBookmark,
  onGoBack,
  onStartSingleQuestion
}) => {
  const [activeTab, setActiveTab] = useState<'past' | 'expected' | 'ai'>('past');
  const [rightView, setRightView] = useState<'history' | 'archive'>('history');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFieldFilter, setSelectedFieldFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'all' | 'correct' | 'incorrect' | 'unattempted'>('all');

  const baseQuestions = questions.filter(q => {
    if (activeTab === 'past') return q.year !== '予想問題' && q.year !== 'AI予想問題';
    if (activeTab === 'expected') return q.year === '予想問題';
    return q.year === 'AI予想問題';
  });

  const totalQuestions = baseQuestions.length;
  const attemptedCount = baseQuestions.filter(q => answerHistory[q.id] !== undefined).length;
  const correctCount = baseQuestions.filter(q => answerHistory[q.id] === true).length;
  const accuracyRate = attemptedCount > 0 ? (correctCount / attemptedCount) * 100 : 0;

  let grade = "- 判定";
  let gradeColor = "bg-slate-100 text-slate-500";
  if (attemptedCount > 0) {
    if (accuracyRate >= 85) {
      grade = "A 判定";
      gradeColor = "bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-lg shadow-teal-500/20";
    } else if (accuracyRate >= 70) {
      grade = "B 判定";
      gradeColor = "bg-gradient-to-br from-teal-400 to-teal-500 text-white shadow-lg shadow-teal-500/20";
    } else if (accuracyRate >= 50) {
      grade = "C 判定";
      gradeColor = "bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/20";
    } else {
      grade = "D 判定";
      gradeColor = "bg-[#ff6f94] text-white shadow-lg shadow-[#ff6f94]/20";
    }
  }

  const fields = Array.from(new Set(baseQuestions.map(q => q.field || '未分類')));

  const fieldStats = fields.map(field => {
    const fieldQuestions = baseQuestions.filter(q => q.field === field);
    const totalInField = fieldQuestions.length;
    const attemptedInField = fieldQuestions.filter(q => answerHistory[q.id] !== undefined).length;
    const correctInField = fieldQuestions.filter(q => answerHistory[q.id] === true).length;
    const accuracy = attemptedInField > 0 ? (correctInField / attemptedInField) * 100 : 0;
    return { field, total: totalInField, attempted: attemptedInField, correct: correctInField, accuracy };
  });

  const filteredQuestions = baseQuestions.filter(q => {
    const textToSearch = `${q.question} ${q.prefecture} ${q.year} ${q.field} ${q.explanation}`.toLowerCase();
    const queryMatch = textToSearch.includes(searchQuery.toLowerCase());
    const fieldMatch = selectedFieldFilter === 'all' || q.field === selectedFieldFilter;
    let statusMatch = true;
    if (selectedStatusFilter === 'correct') statusMatch = answerHistory[q.id] === true;
    else if (selectedStatusFilter === 'incorrect') statusMatch = answerHistory[q.id] === false;
    else if (selectedStatusFilter === 'unattempted') statusMatch = answerHistory[q.id] === undefined;
    return queryMatch && fieldMatch && statusMatch;
  });

  // 問題カード（履歴・アーカイブ共通）
  const QuestionCard = ({ q, showId = false }: { q: Question; showId?: boolean }) => {
    const attempts = attemptsHistory[q.id] || [];
    const displayAttempts: (boolean | null)[] = [...attempts].slice(-3);
    while (displayAttempts.length < 3) displayAttempts.unshift(null);
    const ts = answerTimestamps[q.id];
    const lastAnswered = ts
      ? new Date(ts).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : null;
    const lastResult = attempts.length > 0 ? attempts[attempts.length - 1] : null;
    const isBookmarked = bookmarks.has(q.id);

    return (
      <div className="p-4 sm:p-5 hover:bg-teal-50/30 transition-colors border-b border-slate-100 last:border-b-0">
        {/* タグ行 */}
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          {showId && <span className="font-mono font-black text-xs text-teal-600">No.{q.id}</span>}
          {lastResult === true && (
            <span className="px-2 py-0.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-full text-xs font-black">直近: ○</span>
          )}
          {lastResult === false && (
            <span className="px-2 py-0.5 bg-rose-50 text-rose-500 border border-rose-200 rounded-full text-xs font-black">直近: ×</span>
          )}
          {lastResult === null && answerHistory[q.id] === undefined && (
            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 border border-slate-200 rounded-full text-xs font-black">未解答</span>
          )}
          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs font-bold">{q.year} {q.prefecture}</span>
          <span className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded-full text-xs font-black">{q.field || '未分類'}</span>
          {lastAnswered && <span className="text-xs text-gray-400 font-medium ml-auto">{lastAnswered}</span>}
        </div>

        {/* 問題文 */}
        <p className="text-sm font-bold text-gray-800 leading-relaxed line-clamp-2 mb-3"
          dangerouslySetInnerHTML={{ __html: formatKouAndGou(q.question) }}
        />

        {/* アクション行 */}
        <div className="flex items-center justify-between gap-3">
          {/* 直近3回の○× */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 font-bold mr-1">直近3回</span>
            {displayAttempts.map((attempt, index) => (
              attempt === true ? (
                <div key={index} className="w-7 h-7 rounded-full bg-teal-50 border-2 border-teal-400 flex items-center justify-center text-teal-600 font-extrabold text-sm">○</div>
              ) : attempt === false ? (
                <div key={index} className="w-7 h-7 rounded-full bg-rose-50 border-2 border-rose-300 flex items-center justify-center text-rose-500 font-bold text-sm">×</div>
              ) : (
                <div key={index} className="w-7 h-7 rounded-full bg-slate-50 border-2 border-slate-200 flex items-center justify-center text-gray-300 text-xs font-bold">-</div>
              )
            ))}
          </div>

          <div className="flex items-center gap-2">
            {onToggleBookmark && (
              <button
                onClick={() => onToggleBookmark(q.id)}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${isBookmarked ? 'text-amber-500 bg-amber-50' : 'text-gray-300 hover:text-amber-400 hover:bg-amber-50'}`}
                title={isBookmarked ? 'ブックマーク解除' : 'ブックマーク登録'}
              >
                <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-amber-500' : ''}`} />
              </button>
            )}
            <button
              onClick={() => onStartSingleQuestion(q)}
              className="px-4 py-2 bg-teal-500 hover:bg-teal-600 active:scale-95 text-white font-extrabold rounded-xl shadow-md shadow-teal-500/20 flex items-center gap-1.5 transition-all cursor-pointer text-sm"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              解く
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 pb-2 border-b border-teal-50">
        <button
          onClick={onGoBack}
          className="p-2 bg-white hover:bg-teal-50 text-teal-600 rounded-xl transition-all cursor-pointer border border-teal-50 shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-teal-800">成績レポート</h2>
          <p className="text-xs text-gray-400">解答状況アーカイブ・直近3回の履歴を確認できます</p>
        </div>
      </div>

      {/* 問題種別タブ */}
      <div className="flex bg-slate-100 p-1 rounded-2xl max-w-lg shadow-sm border border-slate-200/50">
        {([
          { key: 'past', label: '過去問', icon: <BookOpen className="w-3.5 h-3.5 text-teal-600" />, activeText: 'text-teal-800' },
          { key: 'expected', label: '予想問題', icon: <Target className="w-3.5 h-3.5 text-rose-500" />, activeText: 'text-rose-800' },
          { key: 'ai', label: 'AI予想', icon: <Sparkles className="w-3.5 h-3.5 text-amber-500" />, activeText: 'text-amber-800' },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setSelectedFieldFilter('all'); }}
            className={`flex-1 py-2 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === tab.key ? `bg-white ${tab.activeText} shadow-sm` : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* メインコンテンツ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 左：全体データ */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-teal-50/50 shadow-xl space-y-6">
            <h3 className="font-extrabold text-gray-800 text-sm border-b pb-3 border-teal-50">全体データ</h3>

            {/* 正答率リング */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-36 h-36">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="#f1f5f9" strokeWidth="10" />
                  <motion.circle
                    cx="60" cy="60" r="50" fill="none"
                    stroke={accuracyRate >= 85 ? '#14b8a6' : accuracyRate >= 70 ? '#14b8a6' : accuracyRate >= 50 ? '#f59e0b' : '#ff6f94'}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 50}`}
                    initial={{ strokeDashoffset: 2 * Math.PI * 50 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 50 * (1 - accuracyRate / 100) }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-black text-slate-800 leading-none font-mono">
                    {accuracyRate.toFixed(0)}
                  </span>
                  <span className="text-xs font-bold text-slate-400">%</span>
                  <span className="text-xs font-bold text-slate-400 mt-0.5">正解率</span>
                </div>
              </div>

              <div className={`w-full px-5 py-3 rounded-2xl flex items-center justify-between ${gradeColor}`}>
                <div>
                  <span className="text-xs font-bold opacity-80 block">総合判定</span>
                  <span className="text-xl font-black tracking-wide">{grade}</span>
                </div>
                <div className="text-right text-sm font-medium opacity-80">
                  {attemptedCount > 0
                    ? <><p>{correctCount}問 正解</p><p>{attemptedCount}問 解答済</p></>
                    : <p>未演習</p>}
                </div>
              </div>
            </div>

            {/* 数字カード */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50/30 p-4 rounded-2xl border border-slate-100 text-center">
                <span className="text-xs text-gray-400 font-bold block mb-1">総出題数</span>
                <span className="text-xl font-black text-slate-700 font-mono">{totalQuestions}問</span>
              </div>
              <div className="bg-slate-50/30 p-4 rounded-2xl border border-slate-100 text-center">
                <span className="text-xs text-gray-400 font-bold block mb-1">着手問題数</span>
                <span className="text-xl font-black text-teal-600 font-mono">{attemptedCount}問</span>
              </div>
            </div>

            {/* 分野別正答率 */}
            <div className="space-y-4 pt-2">
              <h4 className="font-extrabold text-gray-800 text-xs tracking-wider uppercase border-b pb-2">分野別正答率</h4>
              <div className="space-y-3">
                {fieldStats.map(stat => (
                  <div key={stat.field} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-700">{stat.field}</span>
                      <span className="text-gray-400 font-medium font-mono">
                        {stat.attempted > 0 ? `${stat.correct}/${stat.attempted}` : '未着手'}
                        <span className="ml-2 font-bold text-teal-600">{stat.attempted > 0 ? `${stat.accuracy.toFixed(0)}%` : '-'}</span>
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-teal-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${stat.attempted > 0 ? stat.accuracy : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 右：履歴・アーカイブ */}
        <div className="md:col-span-2 space-y-4 flex flex-col">

          {/* ビュー切り替え */}
          <div className="flex bg-slate-100 p-1 rounded-2xl shadow-sm border border-slate-200/50">
            <button
              onClick={() => setRightView('history')}
              className={`flex-1 py-2.5 text-sm font-black rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                rightView === 'history' ? 'bg-white text-teal-800 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <History className="w-4 h-4" />
              学習履歴
            </button>
            <button
              onClick={() => setRightView('archive')}
              className={`flex-1 py-2.5 text-sm font-black rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                rightView === 'archive' ? 'bg-white text-teal-800 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <Archive className="w-4 h-4" />
              問題アーカイブ
            </button>
          </div>

          {/* 学習履歴ビュー */}
          {rightView === 'history' && (() => {
            const attemptedQuestions = baseQuestions
              .filter(q => answerTimestamps[q.id] !== undefined || answerHistory[q.id] !== undefined)
              .sort((a, b) => {
                const ta = answerTimestamps[a.id] ?? 0;
                const tb = answerTimestamps[b.id] ?? 0;
                return tb - ta;
              });

            return (
              <div className="bg-white rounded-3xl border border-teal-50/50 shadow-xl overflow-hidden flex flex-col flex-1 min-h-[460px]">
                <div className="bg-slate-50 px-5 py-3.5 border-b border-teal-50/50 flex items-center justify-between">
                  <h4 className="font-extrabold text-gray-800 text-sm">
                    学習履歴 <span className="text-teal-600 font-mono">{attemptedQuestions.length}問</span>
                  </h4>
                  <p className="text-xs text-gray-400 font-medium">左(古い) → 右(新しい)</p>
                </div>
                <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                  {attemptedQuestions.length === 0 ? (
                    <div className="p-12 text-center space-y-3">
                      <History className="w-8 h-8 text-slate-300 mx-auto" />
                      <p className="text-sm text-slate-400 font-bold">まだ解いた問題がありません</p>
                    </div>
                  ) : (
                    attemptedQuestions.map(q => <QuestionCard key={q.id} q={q} />)
                  )}
                </div>
              </div>
            );
          })()}

          {/* 問題アーカイブビュー */}
          {rightView === 'archive' && (
            <>
              {/* 検索・フィルター */}
              <div className="bg-white p-5 rounded-3xl border border-teal-50/50 shadow-xl space-y-4">
                <div className="relative">
                  <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="問題文・キーワード・自治体・解説から検索..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 focus:border-teal-400 focus:bg-white rounded-2xl outline-none text-sm font-bold text-gray-700 transition-all"
                  />
                </div>

                {/* 解答状態フィルター（ピルボタン） */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">解答状態</label>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { value: 'all', label: 'すべて' },
                      { value: 'correct', label: '✓ 正解' },
                      { value: 'incorrect', label: '✗ 不正解' },
                      { value: 'unattempted', label: '− 未解答' },
                    ] as const).map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setSelectedStatusFilter(opt.value)}
                        className={`px-3 py-1.5 rounded-full text-xs font-black transition-all cursor-pointer ${
                          selectedStatusFilter === opt.value
                            ? 'bg-teal-500 text-white shadow-md shadow-teal-500/20'
                            : 'bg-slate-100 text-slate-600 hover:bg-teal-50 hover:text-teal-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 分野フィルター（ピルボタン） */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">分野</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setSelectedFieldFilter('all')}
                      className={`px-3 py-1.5 rounded-full text-xs font-black transition-all cursor-pointer ${
                        selectedFieldFilter === 'all'
                          ? 'bg-teal-500 text-white shadow-md shadow-teal-500/20'
                          : 'bg-slate-100 text-slate-600 hover:bg-teal-50 hover:text-teal-700'
                      }`}
                    >
                      すべて ({baseQuestions.length})
                    </button>
                    {fields.map(f => (
                      <button
                        key={f}
                        onClick={() => setSelectedFieldFilter(f)}
                        className={`px-3 py-1.5 rounded-full text-xs font-black transition-all cursor-pointer ${
                          selectedFieldFilter === f
                            ? 'bg-teal-500 text-white shadow-md shadow-teal-500/20'
                            : 'bg-slate-100 text-slate-600 hover:bg-teal-50 hover:text-teal-700'
                        }`}
                      >
                        {f} ({baseQuestions.filter(q => q.field === f).length})
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 問題リスト */}
              <div className="bg-white rounded-3xl border border-teal-50/50 shadow-xl overflow-hidden flex flex-col flex-1 min-h-[460px]">
                <div className="bg-slate-50 px-5 py-3.5 border-b border-teal-50/50 flex items-center justify-between">
                  <h4 className="font-extrabold text-gray-800 text-sm">
                    問題一覧 <span className="text-teal-600 font-mono">{filteredQuestions.length}件</span>
                  </h4>
                  <p className="text-xs text-gray-400 font-medium">左(古い) → 右(新しい)</p>
                </div>
                <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                  {filteredQuestions.length === 0 ? (
                    <div className="p-12 text-center space-y-3">
                      <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
                      <p className="text-sm text-slate-400 font-bold">該当する問題が見つかりません</p>
                    </div>
                  ) : (
                    filteredQuestions.map(q => <QuestionCard key={q.id} q={q} showId />)
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
