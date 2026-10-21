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

  // Filter questions based on selected active tab
  const baseQuestions = questions.filter(q => {
    if (activeTab === 'past') {
      return q.year !== '予想問題' && q.year !== 'AI予想問題';
    } else if (activeTab === 'expected') {
      return q.year === '予想問題';
    } else {
      return q.year === 'AI予想問題';
    }
  });

  // Overall Statistics calculations for current tab selection
  const totalQuestions = baseQuestions.length;
  const attemptedCount = baseQuestions.filter(q => answerHistory[q.id] !== undefined).length;
  const correctCount = baseQuestions.filter(q => answerHistory[q.id] === true).length;
  const accuracyRate = attemptedCount > 0 ? (correctCount / attemptedCount) * 100 : 0;

  // Grade decision
  let grade = "- 判定";
  let gradeColor = "bg-slate-100 text-slate-500";
  if (attemptedCount > 0) {
    if (accuracyRate >= 85) {
      grade = "A 判定";
      gradeColor = "bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20";
    } else if (accuracyRate >= 70) {
      grade = "B 判定";
      gradeColor = "bg-gradient-to-br from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/20";
    } else if (accuracyRate >= 50) {
      grade = "C 判定";
      gradeColor = "bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/20";
    } else {
      grade = "D 判定";
      gradeColor = "bg-[#ff6f94] text-white shadow-lg shadow-[#ff6f94]/20";
    }
  }

  // Fields and categories list based on baseQuestions
  const fields = Array.from(new Set(baseQuestions.map(q => q.field || '未分類')));

  // Field details list based on baseQuestions
  const fieldStats = fields.map(field => {
    const fieldQuestions = baseQuestions.filter(q => q.field === field);
    const totalInField = fieldQuestions.length;
    const attemptedInField = fieldQuestions.filter(q => answerHistory[q.id] !== undefined).length;
    const correctInField = fieldQuestions.filter(q => answerHistory[q.id] === true).length;
    const accuracy = attemptedInField > 0 ? (correctInField / attemptedInField) * 100 : 0;
    return {
      field,
      total: totalInField,
      attempted: attemptedInField,
      correct: correctInField,
      accuracy
    };
  });

  // Filter & Search logic using baseQuestions
  const filteredQuestions = baseQuestions.filter(q => {
    // Search keyword query match
    const textToSearch = `${q.question} ${q.prefecture} ${q.year} ${q.field} ${q.explanation}`.toLowerCase();
    const queryMatch = textToSearch.includes(searchQuery.toLowerCase());

    // Field category match
    const fieldMatch = selectedFieldFilter === 'all' || q.field === selectedFieldFilter;

    // Correctness status match
    let statusMatch = true;
    if (selectedStatusFilter === 'correct') {
      statusMatch = answerHistory[q.id] === true;
    } else if (selectedStatusFilter === 'incorrect') {
      statusMatch = answerHistory[q.id] === false;
    } else if (selectedStatusFilter === 'unattempted') {
      statusMatch = answerHistory[q.id] === undefined;
    }

    return queryMatch && fieldMatch && statusMatch;
  });

  return (
    <div className="space-y-6">
      {/* Back navigation header styling */}
      <div className="flex items-center justify-between pb-2 border-b border-teal-50">
        <div className="flex items-center gap-3">
          <button
            onClick={onGoBack}
            className="p-2 bg-white hover:bg-teal-50 text-teal-600 rounded-xl transition-all cursor-pointer border border-teal-50 shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-teal-800 flex items-center gap-2">
              成績レポート
            </h2>
            <p className="text-xs text-gray-400">
              全収録問題の解答状況アーカイブと、過去3回の解答履歴を確認できます。
            </p>
          </div>
        </div>
      </div>

      {/* Segmented Tab Switcher */}
      <div className="flex bg-slate-100 p-1 rounded-2xl max-w-lg shadow-sm border border-slate-200/50">
        <button
          onClick={() => {
            setActiveTab('past');
            setSelectedFieldFilter('all');
          }}
          className={`flex-1 py-2 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'past'
              ? 'bg-white text-teal-800 shadow-sm'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5 text-teal-600" />
          <span>過去問</span>
        </button>
        <button
          onClick={() => {
            setActiveTab('expected');
            setSelectedFieldFilter('all');
          }}
          className={`flex-1 py-2 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'expected'
              ? 'bg-white text-rose-800 shadow-sm'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <Target className="w-3.5 h-3.5 text-rose-600" />
          <span>予想問題</span>
        </button>
        <button
          onClick={() => {
            setActiveTab('ai');
            setSelectedFieldFilter('all');
          }}
          className={`flex-1 py-2 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'ai'
              ? 'bg-white text-amber-800 shadow-sm'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>AI予想問題</span>
        </button>
      </div>

      {/* Main dashboard content columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Side: General Report analysis */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-teal-50/50 shadow-xl space-y-6">
            <h3 className="font-extrabold text-gray-800 text-sm border-b pb-3 border-teal-50">全体データ</h3>
            
            {/* Circular accuracy + grade card */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-36 h-36">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="#f1f5f9" strokeWidth="10" />
                  <motion.circle
                    cx="60" cy="60" r="50" fill="none"
                    stroke={accuracyRate >= 85 ? '#10b981' : accuracyRate >= 70 ? '#14b8a6' : accuracyRate >= 50 ? '#f59e0b' : '#ff6f94'}
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
                  <span className="text-[9px] font-bold text-slate-400 mt-0.5">正解率</span>
                </div>
              </div>

              <div className={`w-full px-5 py-3 rounded-2xl flex items-center justify-between ${gradeColor}`}>
                <div>
                  <span className="text-[10px] font-bold opacity-80 block">総合判定</span>
                  <span className="text-xl font-black tracking-wide">{grade}</span>
                </div>
                <div className="text-right text-xs font-medium opacity-80">
                  {attemptedCount > 0
                    ? <><p>{correctCount}問 正解</p><p>{attemptedCount}問 解答済</p></>
                    : <p>未演習</p>}
                </div>
              </div>
            </div>

            {/* Metrics group */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50/30 p-4 rounded-2xl border border-slate-100 text-center">
                <span className="text-[10px] text-gray-400 font-bold block mb-1">総出題数</span>
                <span className="text-xl font-black text-slate-700 font-mono">{totalQuestions}問</span>
              </div>
              <div className="bg-slate-50/30 p-4 rounded-2xl border border-slate-100 text-center">
                <span className="text-[10px] text-gray-400 font-bold block mb-1">着手問題数</span>
                <span className="text-xl font-black text-teal-600 font-mono">{attemptedCount}問</span>
              </div>
            </div>

            {/* Field breakdown list matching reference image exactly with horizontal fill meters */}
            <div className="space-y-4 pt-2">
              <h4 className="font-extrabold text-gray-800 text-xs tracking-wider uppercase border-b pb-2">分野別正答率</h4>
              <div className="space-y-3">
                {fieldStats.map(stat => (
                  <div key={stat.field} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-700">{stat.field}</span>
                      <span className="text-gray-400 font-medium font-mono">
                        {stat.attempted > 0 ? `正解 ${stat.correct}/${stat.attempted}` : '未着手'}
                        <span className="ml-2 font-bold text-emerald-600">{stat.attempted > 0 ? `${stat.accuracy.toFixed(0)}%` : '-'}</span>
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

        {/* Right Side */}
        <div className="md:col-span-2 space-y-4 flex flex-col">

          {/* View toggle: 学習履歴 / 問題アーカイブ */}
          <div className="flex bg-slate-100 p-1 rounded-2xl shadow-sm border border-slate-200/50">
            <button
              onClick={() => setRightView('history')}
              className={`flex-1 py-2 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                rightView === 'history' ? 'bg-white text-teal-800 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              学習履歴（新しい順）
            </button>
            <button
              onClick={() => setRightView('archive')}
              className={`flex-1 py-2 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                rightView === 'archive' ? 'bg-white text-teal-800 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              問題アーカイブ（全問題）
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
                <div className="bg-slate-50 p-4 border-b border-teal-50/50 flex items-center justify-between">
                  <h4 className="font-extrabold text-gray-800 text-xs">
                    学習履歴 <span className="text-teal-600">{attemptedQuestions.length}問</span>
                  </h4>
                  <p className="text-[10px] text-gray-400 font-medium">直近3回: 左(古い) → 右(新しい)</p>
                </div>
                <div className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
                  {attemptedQuestions.length === 0 ? (
                    <div className="p-12 text-center space-y-3">
                      <History className="w-8 h-8 text-slate-300 mx-auto" />
                      <p className="text-xs text-slate-400 font-bold">まだ解いた問題がありません。</p>
                    </div>
                  ) : (
                    attemptedQuestions.map(q => {
                      const attempts = attemptsHistory[q.id] || [];
                      const displayAttempts: (boolean | null)[] = [...attempts].slice(-3);
                      while (displayAttempts.length < 3) displayAttempts.unshift(null);
                      const ts = answerTimestamps[q.id];
                      const lastAnswered = ts
                        ? new Date(ts).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : null;
                      const lastResult = attempts.length > 0 ? attempts[attempts.length - 1] : null;

                      return (
                        <div key={q.id} className="p-4 hover:bg-slate-50/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {lastResult === true && (
                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-full text-[9px] font-black">直近: ○</span>
                              )}
                              {lastResult === false && (
                                <span className="px-2 py-0.5 bg-rose-50 text-rose-500 border border-rose-200 rounded-full text-[9px] font-black">直近: ×</span>
                              )}
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[9px] font-bold">{q.year} {q.prefecture}</span>
                              <span className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded-full text-[9px] font-black">{q.field || '未分類'}</span>
                              {lastAnswered && <span className="text-[9px] text-gray-400 font-medium">{lastAnswered}</span>}
                            </div>
                            <p className="font-bold text-gray-700 break-words leading-relaxed line-clamp-2 pr-2"
                              dangerouslySetInnerHTML={{ __html: formatKouAndGou(q.question) }}
                            />
                          </div>
                          <div className="flex items-center gap-3 shrink-0 justify-between sm:justify-end">
                            <div className="flex items-center gap-1.5">
                              {displayAttempts.map((attempt, index) => (
                                attempt === true ? (
                                  <div key={index} className="w-6 h-6 rounded-full bg-emerald-50 border border-emerald-300 flex items-center justify-center text-emerald-600 font-extrabold text-xs shadow-sm">○</div>
                                ) : attempt === false ? (
                                  <div key={index} className="w-6 h-6 rounded-full bg-[#ff6f94]/10 border border-[#ff6f94]/30 flex items-center justify-center text-[#ff6f94] font-bold text-xs shadow-sm">×</div>
                                ) : (
                                  <div key={index} className="w-6 h-6 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-gray-300 text-[10px] font-bold">-</div>
                                )
                              ))}
                            </div>
                            {onToggleBookmark && (
                              <button
                                onClick={() => onToggleBookmark(q.id)}
                                className={`p-1.5 rounded-lg transition-colors ${bookmarks.has(q.id) ? 'text-amber-500 bg-amber-50' : 'text-gray-300 hover:text-amber-400 hover:bg-amber-50'}`}
                                title={bookmarks.has(q.id) ? 'ブックマーク解除' : 'ブックマーク登録'}
                              >
                                <Bookmark className={`w-3.5 h-3.5 ${bookmarks.has(q.id) ? 'fill-amber-500' : ''}`} />
                              </button>
                            )}
                            <button
                              onClick={() => onStartSingleQuestion(q)}
                              className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white font-extrabold rounded-xl shadow-md shadow-teal-500/10 flex items-center gap-1 transition-all cursor-pointer text-xs"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              解く
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })()}

          {/* 問題アーカイブビュー */}
          {rightView === 'archive' && (
            <>
              <div className="bg-white p-5 rounded-3xl border border-teal-50/50 shadow-xl space-y-4">
                <div className="relative">
                  <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="問題文、キーワード、出題自治体、解説文から検索..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 focus:border-teal-400 focus:bg-white rounded-2xl outline-none text-xs font-bold text-gray-700 transition-all shadow-inner"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">分野フィルター</label>
                    <select
                      value={selectedFieldFilter}
                      onChange={e => setSelectedFieldFilter(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-100 focus:border-teal-300 rounded-xl outline-none text-xs font-bold text-gray-700 cursor-pointer appearance-none"
                    >
                      <option value="all">すべての分野 ({baseQuestions.length})</option>
                      {fields.map(f => (
                        <option key={f} value={f}>{f} ({baseQuestions.filter(q => q.field === f).length})</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">解答状態</label>
                    <select
                      value={selectedStatusFilter}
                      onChange={e => setSelectedStatusFilter(e.target.value as any)}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-100 focus:border-[#ff6f94] rounded-xl outline-none text-xs font-bold text-gray-700 cursor-pointer"
                    >
                      <option value="all">すべての解答状態</option>
                      <option value="correct">正解している問題</option>
                      <option value="incorrect">間違えた問題</option>
                      <option value="unattempted">未着手の問題</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-teal-50/50 shadow-xl overflow-hidden flex flex-col flex-1 min-h-[460px]">
                <div className="bg-slate-50 p-4 border-b border-teal-50/50 flex items-center justify-between">
                  <h4 className="font-extrabold text-gray-800 text-xs">全問題一覧 ({filteredQuestions.length}件)</h4>
                  <p className="text-[10px] text-gray-400 font-medium">直近3回: 左(古い) → 右(新しい)</p>
                </div>
                <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                  {filteredQuestions.length === 0 ? (
                    <div className="p-12 text-center space-y-3">
                      <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
                      <p className="text-xs text-slate-400 font-bold">該当する問題が見つかりません。</p>
                    </div>
                  ) : (
                    filteredQuestions.map(q => {
                      const attempts = attemptsHistory[q.id] || [];
                      const displayAttempts: (boolean | null)[] = [...attempts].slice(-3);
                      while (displayAttempts.length < 3) displayAttempts.unshift(null);
                      return (
                        <div key={q.id} className="p-4 hover:bg-slate-50/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
                          <div className="space-y-2 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-black text-xs text-teal-600">No.{q.id}</span>
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[9px] font-bold">{q.year} {q.prefecture}</span>
                              <span className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded-full text-[9px] font-black">{q.field || '未分類'}</span>
                            </div>
                            <p className="font-bold text-gray-700 break-words leading-relaxed line-clamp-2 pr-2"
                              dangerouslySetInnerHTML={{ __html: formatKouAndGou(q.question) }}
                            />
                          </div>
                          <div className="flex items-center gap-4 shrink-0 justify-between sm:justify-end">
                            <div className="flex items-center gap-1.5">
                              {displayAttempts.map((attempt, index) => (
                                attempt === true ? (
                                  <div key={index} className="w-6 h-6 rounded-full bg-emerald-50 border border-emerald-300 flex items-center justify-center text-emerald-600 font-extrabold text-xs shadow-sm">○</div>
                                ) : attempt === false ? (
                                  <div key={index} className="w-6 h-6 rounded-full bg-[#ff6f94]/10 border border-[#ff6f94]/30 flex items-center justify-center text-[#ff6f94] font-bold text-xs shadow-sm">×</div>
                                ) : (
                                  <div key={index} className="w-6 h-6 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-gray-300 text-[10px] font-bold">-</div>
                                )
                              ))}
                            </div>
                            {onToggleBookmark && (
                              <button
                                onClick={() => onToggleBookmark(q.id)}
                                className={`p-1.5 rounded-lg transition-colors ${bookmarks.has(q.id) ? 'text-amber-500 bg-amber-50' : 'text-gray-300 hover:text-amber-400 hover:bg-amber-50'}`}
                                title={bookmarks.has(q.id) ? 'ブックマーク解除' : 'ブックマーク登録'}
                              >
                                <Bookmark className={`w-3.5 h-3.5 ${bookmarks.has(q.id) ? 'fill-amber-500' : ''}`} />
                              </button>
                            )}
                            <button
                              onClick={() => onStartSingleQuestion(q)}
                              className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white font-extrabold rounded-xl shadow-md shadow-teal-500/10 flex items-center gap-1 transition-all cursor-pointer text-xs"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              解く
                            </button>
                          </div>
                        </div>
                      );
                    })
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
