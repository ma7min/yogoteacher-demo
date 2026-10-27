import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { MapPin, BookOpen, Star, Sparkles, AlertCircle, ArrowLeft, Check, CheckSquare, Square, Download, Save, RotateCcw, Layers, Target, HelpCircle, Bookmark } from 'lucide-react';
import { MainMode, Question } from '../types';

interface SelectionScreenProps {
  mode: MainMode;
  questions: Question[];
  answerHistory: Record<string | number, boolean>;
  attemptsHistory?: Record<string | number, boolean[]>;
  bookmarks?: Set<string | number>;
  onStartQuiz: (filtered: Question[], groupByField?: boolean) => void;
  onGoBack: () => void;
  onStartAiQuiz: (difficulty: string) => void;
  aiLoading: boolean;
}

type ReviewFilter = 'last_wrong' | 'repeated_wrong' | 'regressed' | 'unattempted' | 'bookmarked';

const REGIONS = {
  "北海道・東北": ["北海道・札幌市", "青森県", "岩手県", "宮城県・仙台市", "秋田県", "山形県", "福島県"],
  "関東": ["茨城県", "栃木県", "群馬県", "埼玉県・さいたま市", "千葉県・千葉市", "東京都", "神奈川県・横浜市・川崎市・相模原市"],
  "北陸・甲信越": ["新潟県", "新潟市", "富山県", "石川県", "福井県", "山梨県", "長野県"],
  "東海": ["岐阜県", "静岡県", "静岡市", "浜松市", "愛知県", "名古屋市", "三重県"],
  "近畿": ["滋賀県", "京都府", "京都市", "大阪府", "大阪市", "堺市", "兵庫県", "神戸市", "奈良県", "和歌山県"],
  "中国": ["鳥取県", "島根県", "岡山県", "岡山市", "広島県", "広島市", "山口県"],
  "四国": ["徳島県", "香川県", "愛媛県", "高知県"],
  "九州・沖縄": ["福岡県", "北九州市", "福岡市", "佐賀県", "長崎県", "熊本県", "熊本市", "大分県", "宮崎県", "鹿児島県", "沖縄県"]
};

export const SelectionScreen: React.FC<SelectionScreenProps> = ({
  mode,
  questions,
  answerHistory,
  attemptsHistory = {},
  bookmarks = new Set(),
  onStartQuiz,
  onGoBack,
  onStartAiQuiz,
  aiLoading
}) => {
  // Filter out '予想問題' from the base list for past quiz filtering
  const baseQuestions = questions.filter(q => q.year !== '予想問題');

  // All years from data
  const availableYears = Array.from(new Set(baseQuestions.map(q => q.year))).sort().reverse() as string[];
  
  // All unique fields from data
  const availableFields = Array.from(new Set(baseQuestions.map(q => q.field || "未分類"))) as string[];

  // Mode: Expected
  const expectedQuestions = questions.filter(q => q.year === '予想問題');
  const availableExpectedFields = Array.from(new Set(expectedQuestions.map(q => q.field || "未分類"))) as string[];
  const [selectedExpectedFields, setSelectedExpectedFields] = useState<string[]>(availableExpectedFields);
  const [expectedType, setExpectedType] = useState<'all' | 'basic' | 'advanced'>('all');
  const [expectedHitCount, setExpectedHitCount] = useState<number>(0);

  // Mode: Past States
  const [selectedYears, setSelectedYears] = useState<string[]>(availableYears);
  const [selectedFields, setSelectedFields] = useState<string[]>(availableFields);

  const availablePrefs = Array.from(new Set(baseQuestions.map(q => q.prefecture).filter(Boolean))) as string[];
  const [selectedPrefs, setSelectedPrefs] = useState<string[]>(availablePrefs);
  const [openRegions, setOpenRegions] = useState<Record<string, boolean>>({});

  // Mode: AI expected difficulty state
  const [aiDifficulty, setAiDifficulty] = useState<string>('3'); // "1"〜"5" の5段階

  // Hit Count calculation
  const [hitCount, setHitCount] = useState<number>(0);

  // Toggle Single Region's Accordion
  const toggleRegion = (region: string) => {
    setOpenRegions(prev => ({ ...prev, [region]: !prev[region] }));
  };

  // Toggle Preference Select
  const handlePrefToggle = (pref: string) => {
    setSelectedPrefs(prev => 
      prev.includes(pref) ? prev.filter(p => p !== pref) : [...prev, pref]
    );
  };

  // Toggle Field Card Select
  const handleFieldToggle = (field: string) => {
    setSelectedFields(prev =>
      prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]
    );
  };

  // Toggle Year Card Select
  const handleYearToggle = (year: string) => {
    setSelectedYears(prev =>
      prev.includes(year) ? prev.filter(y => y !== year) : [...prev, year]
    );
  };

  // Select all or deselect all helper
  const handleAllFieldsToggle = (checked: boolean) => {
    setSelectedFields(checked ? availableFields : []);
  };

  const handleAllYearsToggle = (checked: boolean) => {
    setSelectedYears(checked ? availableYears : []);
  };

  // Favorite Prefs Save / Load
  const handleSaveFavoritePrefs = () => {
    if (selectedPrefs.length === 0) {
      alert("保存する自治体を1つ以上選択してください。");
      return;
    }
    localStorage.setItem('favoritePrefs', JSON.stringify(selectedPrefs));
    alert("お気に入りの自治体を保存しました！🌟");
  };

  const handleLoadFavoritePrefs = () => {
    const saved = localStorage.getItem('favoritePrefs');
    if (saved) {
      const parsed = JSON.parse(saved);
      setSelectedPrefs(parsed);
      // 自動設定：お気に入りが入っている地方のアコーディオンを広げる
      const newOpenRegions: Record<string, boolean> = {};
      Object.entries(REGIONS).forEach(([region, prefs]) => {
        if (prefs.some(p => parsed.includes(p))) {
          newOpenRegions[region] = true;
        }
      });
      setOpenRegions(prev => ({ ...prev, ...newOpenRegions }));
      alert("お気に入りの自治体を読み込みました！📂");
    } else {
      alert("保存されたお気に入りが見つかりませんでした。");
    }
  };

  const handleSelectAllPrefs = () => {
    const allPrefs = Object.values(REGIONS).flat();
    setSelectedPrefs(allPrefs);
  };

  const handleClearAllPrefs = () => {
    setSelectedPrefs([]);
  };

  const handleExpectedFieldToggle = (field: string) => {
    setSelectedExpectedFields(prev =>
      prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]
    );
  };

  const handleAllExpectedFieldsToggle = (checked: boolean) => {
    setSelectedExpectedFields(checked ? availableExpectedFields : []);
  };

  // Recalculate match question amounts
  useEffect(() => {
    if (mode === 'past') {
      const matched = baseQuestions.filter(q => {
        const yearMatch = selectedYears.includes(q.year);
        const prefMatch = selectedPrefs.includes(q.prefecture);
        const fieldMatch = selectedFields.includes(q.field || "未分類");
        return yearMatch && prefMatch && fieldMatch;
      });
      setHitCount(matched.length);
    } else if (mode === 'expected') {
      const matched = expectedQuestions.filter(q => {
        const fieldMatch = selectedExpectedFields.includes(q.field || "未分類");
        const typeMatch = expectedType === 'all' || q.type === expectedType;
        return fieldMatch && typeMatch;
      });
      setExpectedHitCount(matched.length);
    }
  }, [selectedYears, selectedPrefs, selectedFields, baseQuestions, mode, expectedQuestions, selectedExpectedFields, expectedType]);

  // Execute past quiz
  const handleBeginPastQuiz = (groupByField: boolean) => {
    if (selectedPrefs.length === 0) {
      alert("受験を希望する「自治体」を1つ以上選択してください。");
      return;
    }
    if (selectedFields.length === 0) {
      alert("出題対象の「分野」を1つ以上選択してください。");
      return;
    }
    if (selectedYears.length === 0) {
      alert("出題対象の「年度」を1つ以上選択してください。");
      return;
    }

    const filtered = baseQuestions.filter(q => {
      const yearMatch = selectedYears.includes(q.year);
      const prefMatch = selectedPrefs.includes(q.prefecture);
      const fieldMatch = selectedFields.includes(q.field || "未分類");
      return yearMatch && prefMatch && fieldMatch;
    });

    if (filtered.length === 0) {
      alert("選択された該当問題数が0件です。条件をもう一度ご確認のうえ、変更してください。");
      return;
    }

    onStartQuiz(filtered, groupByField);
  };

  // Execute expected quiz
  const handleBeginExpectedQuiz = (groupByField: boolean) => {
    if (selectedExpectedFields.length === 0) {
      alert("出題対象の「分野」を1つ以上選択してください。");
      return;
    }

    const filtered = expectedQuestions.filter(q => {
      const fieldMatch = selectedExpectedFields.includes(q.field || "未分類");
      const typeMatch = expectedType === 'all' || q.type === expectedType;
      return fieldMatch && typeMatch;
    });

    if (filtered.length === 0) {
      alert("選択された該当問題数が0件です。条件をもう一度ご確認のうえ、変更してください。");
      return;
    }

    onStartQuiz(filtered, groupByField);
  };

  // Review filter state
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('last_wrong');

  const getReviewFiltered = (filter: ReviewFilter): Question[] => {
    switch (filter) {
      case 'last_wrong':
        // 直近の回答が不正解
        return questions.filter(q => {
          const attempts = attemptsHistory[q.id];
          if (attempts && attempts.length > 0) return attempts[attempts.length - 1] === false;
          return answerHistory[q.id] === false;
        });
      case 'repeated_wrong':
        // 直近2回以上連続で不正解
        return questions.filter(q => {
          const attempts = attemptsHistory[q.id];
          if (!attempts || attempts.length < 2) return false;
          return attempts[attempts.length - 1] === false && attempts[attempts.length - 2] === false;
        });
      case 'regressed':
        // 一度正解したのに直近で不正解（定着していない問題）
        return questions.filter(q => {
          const attempts = attemptsHistory[q.id];
          if (!attempts || attempts.length < 2) return false;
          const lastWrong = attempts[attempts.length - 1] === false;
          const hadCorrect = attempts.slice(0, -1).some(a => a === true);
          return lastWrong && hadCorrect;
        });
      case 'unattempted':
        // 一度も解いていない問題
        return questions.filter(q => !attemptsHistory[q.id] && answerHistory[q.id] === undefined);
      case 'bookmarked':
        return questions.filter(q => bookmarks.has(q.id));
      default:
        return [];
    }
  };

  const reviewFilteredCount = getReviewFiltered(reviewFilter).length;

  // Execute review quiz
  const handleBeginReviewQuiz = () => {
    const filtered = getReviewFiltered(reviewFilter);
    if (filtered.length === 0) {
      alert("該当する問題がありません。別のフィルターを試してください 🎉");
      return;
    }
    onStartQuiz(filtered, false);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Selection Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onGoBack}
          className="p-2 border border-teal-100 rounded-xl hover:bg-teal-50 text-teal-700 transition-colors shadow-sm bg-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h3 className="text-xl font-extrabold text-teal-800">
            {mode === 'past' && "過去問演習の設定"}
            {mode === 'expected' && "予想問題の設定"}
            {mode === 'ai' && "AI予想問題の生成"}
            {mode === 'review' && "苦手克服"}
          </h3>
          <p className="text-xs text-gray-500">
            {mode === 'past' && "自治体、教科分野、出題年度を設定して開始します"}
            {mode === 'expected' && "出題分野を設定して予想問題を開始します"}
            {mode === 'ai' && "Gemini APIが指定された難易度に基づき自動で5問オリジナルの予想問題を生成します"}
            {mode === 'review' && "過去に間違えた問題に何度も再挑戦し、弱点を克服します"}
          </p>
        </div>
      </div>

      {/* RENDER MODE: PAST */}
      {mode === 'past' && (
        <div className="space-y-5">

          {/* STEP 1: 自治体 */}
          <div className="bg-white rounded-3xl border border-teal-100/60 shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-teal-500 to-teal-600 px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-white/30 text-white text-xs font-black flex items-center justify-center">1</span>
                <h4 className="font-bold text-white text-sm flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" />
                  受験希望の自治体を選択
                </h4>
              </div>
              {selectedPrefs.length > 0 && (
                <span className="bg-white/20 text-white text-[11px] font-bold px-2.5 py-1 rounded-full">
                  {selectedPrefs.length}件選択中
                </span>
              )}
            </div>

            <div className="p-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleSelectAllPrefs}
                  className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 rounded-lg font-bold text-[11px] flex items-center gap-1 transition-colors"
                >
                  <CheckSquare className="w-3.5 h-3.5" />すべて選択
                </button>
                <button
                  onClick={handleClearAllPrefs}
                  className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg font-bold text-[11px] flex items-center gap-1 transition-colors"
                >
                  <Square className="w-3.5 h-3.5" />すべて解除
                </button>
                <button
                  onClick={handleSaveFavoritePrefs}
                  className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg font-bold text-[11px] flex items-center gap-1 transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />お気に入り保存
                </button>
                <button
                  onClick={handleLoadFavoritePrefs}
                  className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg font-bold text-[11px] flex items-center gap-1 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />お気に入り呼出
                </button>
              </div>

              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
                {Object.entries(REGIONS).map(([region, prefs]) => {
                  const isOpen = openRegions[region] || false;
                  const regionPrefsCount = prefs.filter(p => selectedPrefs.includes(p)).length;
                  return (
                    <div key={region} className="rounded-xl border border-slate-100 overflow-hidden">
                      <button
                        onClick={() => toggleRegion(region)}
                        className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${
                          regionPrefsCount > 0 ? 'bg-teal-50/70' : 'bg-slate-50/60 hover:bg-slate-100/60'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${regionPrefsCount > 0 ? 'bg-teal-500' : 'bg-slate-300'}`} />
                          <span className={`text-xs font-bold ${regionPrefsCount > 0 ? 'text-teal-800' : 'text-slate-700'}`}>{region}</span>
                          {regionPrefsCount > 0 && (
                            <span className="bg-teal-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                              {regionPrefsCount}
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] text-slate-400">{isOpen ? '▲' : '▼'}</span>
                      </button>
                      {isOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 p-2.5 bg-white border-t border-slate-100"
                        >
                          {prefs.map(pref => {
                            const isSelected = selectedPrefs.includes(pref);
                            return (
                              <button
                                key={pref}
                                onClick={() => handlePrefToggle(pref)}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-left transition-all text-xs ${
                                  isSelected
                                    ? 'bg-teal-500 border-teal-500 text-white font-bold'
                                    : 'bg-white border-slate-200 text-gray-600 hover:border-teal-300 hover:bg-teal-50/40'
                                }`}
                              >
                                {isSelected && <Check className="w-3 h-3 shrink-0" />}
                                <span className="truncate">{pref}</span>
                              </button>
                            );
                          })}
                        </motion.div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* STEP 2: 分野 */}
          <div className="bg-white rounded-3xl border border-teal-100/60 shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-teal-500 to-teal-600 px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-white/30 text-white text-xs font-black flex items-center justify-center">2</span>
                <h4 className="font-bold text-white text-sm flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4" />
                  出題分野を選択
                </h4>
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-white/90 font-bold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selectedFields.length === availableFields.length}
                  onChange={(e) => handleAllFieldsToggle(e.target.checked)}
                  className="rounded border-white/60 text-teal-500 focus:ring-white/40"
                />
                すべて選択
              </label>
            </div>

            <div className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {availableFields.map(field => {
                  const isSelected = selectedFields.includes(field);
                  return (
                    <button
                      key={field}
                      onClick={() => handleFieldToggle(field)}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-between gap-1 cursor-pointer select-none ${
                        isSelected
                          ? 'bg-teal-500 border-teal-500 text-white shadow-sm'
                          : 'bg-slate-50/60 border-slate-200 text-gray-600 hover:border-teal-300 hover:bg-teal-50/30'
                      }`}
                    >
                      <span className="truncate text-left">{field}</span>
                      {isSelected && <Check className="w-3 h-3 text-white shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* STEP 3: 年度 */}
          <div className="bg-white rounded-3xl border border-teal-100/60 shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-teal-500 to-teal-600 px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-white/30 text-white text-xs font-black flex items-center justify-center">3</span>
                <h4 className="font-bold text-white text-sm flex items-center gap-1.5">
                  <Star className="w-4 h-4" />
                  出題年度を選択
                </h4>
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-white/90 font-bold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selectedYears.length === availableYears.length}
                  onChange={(e) => handleAllYearsToggle(e.target.checked)}
                  className="rounded border-white/60 text-teal-500 focus:ring-white/40"
                />
                すべて選択
              </label>
            </div>

            <div className="p-4">
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {availableYears.map(year => {
                  const isSelected = selectedYears.includes(year);
                  return (
                    <button
                      key={year}
                      onClick={() => handleYearToggle(year)}
                      className={`py-2.5 px-2 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer select-none ${
                        isSelected
                          ? 'bg-teal-500 border-teal-500 text-white shadow-sm'
                          : 'bg-slate-50/60 border-slate-200 text-gray-600 hover:border-teal-300 hover:bg-teal-50/30'
                      }`}
                    >
                      {year}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* HIT COUNT BAR */}
          <div className={`border p-4 rounded-2xl flex items-center justify-between ${
            hitCount > 0 ? 'bg-teal-50/60 border-teal-200' : 'bg-slate-50 border-slate-200'
          }`}>
            <span className="text-xs font-bold text-gray-600 flex items-center gap-1.5">
              <Target className="w-4 h-4 text-teal-500 shrink-0" />
              条件に一致する問題数
            </span>
            <span className={`text-2xl font-black font-mono ${hitCount > 0 ? 'text-teal-600' : 'text-gray-300'}`}>
              {hitCount}<span className="text-xs font-bold ml-1">問</span>
            </span>
          </div>

          <button
            onClick={() => handleBeginPastQuiz(false)}
            disabled={hitCount === 0}
            className="w-full py-5 bg-teal-500 hover:bg-teal-600 active:scale-95 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-extrabold rounded-2xl shadow-xl shadow-teal-500/30 text-center transition-all duration-150 cursor-pointer text-base"
          >
            {hitCount > 0 ? `▶ ${hitCount}問で過去問演習スタート` : '条件を選択してください'}
          </button>
        </div>
      )}

      {/* RENDER MODE: EXPECTED */}
      {mode === 'expected' && (
        <div className="space-y-6">
          {/* Field Selection Card */}
          <div className="bg-white p-6 rounded-3xl border border-orange-50/50 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-orange-600" />
                  出題分野を選択
                </h4>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  学校保健安全法、施行令、施行規則などの法令単位で絞り込みが可能です
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedExpectedFields(availableExpectedFields)}
                  className="text-xs text-orange-600 font-bold hover:underline cursor-pointer"
                >
                  すべて選択
                </button>
                <span className="text-gray-300">|</span>
                <button
                  type="button"
                  onClick={() => setSelectedExpectedFields([])}
                  className="text-xs text-gray-500 font-bold hover:underline cursor-pointer"
                >
                  解除
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
              {availableExpectedFields.map(field => {
                const isSelected = selectedExpectedFields.includes(field);
                const fieldTotalCount = expectedQuestions.filter(q => (q.field || "未分類") === field).length;
                const fieldFilteredCount = expectedQuestions.filter(q => (q.field || "未分類") === field && (expectedType === 'all' || q.type === expectedType)).length;
                
                return (
                  <button
                    key={field}
                    type="button"
                    onClick={() => handleExpectedFieldToggle(field)}
                    className={`px-4 py-3 rounded-2xl border text-left transition-all flex items-center justify-between gap-2 cursor-pointer select-none ${
                      isSelected
                        ? 'bg-orange-50/80 border-orange-400 text-orange-950 shadow-sm ring-1 ring-orange-400/50'
                        : 'bg-slate-50/60 border-slate-200/80 text-gray-600 hover:border-slate-300 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-orange-500 text-white' : 'border border-gray-300 bg-white'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <span className="text-xs font-bold truncate">{field}</span>
                    </div>
                    <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full shrink-0 font-bold ${
                      isSelected ? 'bg-orange-200 text-orange-900' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {fieldFilteredCount}問
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Type / Difficulty Selection Card (基礎 vs 応用・発展) */}
          <div className="bg-white p-6 rounded-3xl border border-orange-50/50 shadow-xl space-y-4">
            <div>
              <h4 className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-orange-600" />
                出題形式（難易度）を選択
              </h4>
              <p className="text-[11px] text-gray-400 mt-0.5">
                学習の進度に合わせて、1問1空欄の「基礎」か、条文丸ごと制覇する「応用・発展」を選択できます
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              {/* Option 1: All */}
              {(() => {
                const isSelected = expectedType === 'all';
                const count = expectedQuestions.filter(q => selectedExpectedFields.includes(q.field || "未分類")).length;
                return (
                  <button
                    type="button"
                    onClick={() => setExpectedType('all')}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer select-none flex flex-col justify-between relative ${
                      isSelected
                        ? 'bg-gradient-to-br from-orange-50 to-amber-50 border-orange-500 text-orange-950 shadow-md ring-2 ring-orange-400/40'
                        : 'bg-white border-slate-200 text-gray-600 hover:border-slate-300 hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-black text-sm flex items-center gap-1.5">
                        <span className="text-base">🌟</span> すべて
                      </span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                        isSelected ? 'bg-orange-200 text-orange-900' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {count}問
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-gray-500">
                      基礎問題と応用・発展問題の両方を網羅的に総合演習
                    </p>
                  </button>
                );
              })()}

              {/* Option 2: Basic */}
              {(() => {
                const isSelected = expectedType === 'basic';
                const count = expectedQuestions.filter(q => q.type === 'basic' && selectedExpectedFields.includes(q.field || "未分類")).length;
                return (
                  <button
                    type="button"
                    onClick={() => setExpectedType('basic')}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer select-none flex flex-col justify-between relative ${
                      isSelected
                        ? 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-500 text-emerald-950 shadow-md ring-2 ring-emerald-400/40'
                        : 'bg-white border-slate-200 text-gray-600 hover:border-slate-300 hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-black text-sm flex items-center gap-1.5">
                        <span className="text-base">🟢</span> 基礎問題
                      </span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                        isSelected ? 'bg-emerald-200 text-emerald-900' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {count}問
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-gray-500">
                      1問につき1つの空欄に集中して重要語句を総チェック
                    </p>
                  </button>
                );
              })()}

              {/* Option 3: Advanced */}
              {(() => {
                const isSelected = expectedType === 'advanced';
                const count = expectedQuestions.filter(q => q.type === 'advanced' && selectedExpectedFields.includes(q.field || "未分類")).length;
                return (
                  <button
                    type="button"
                    onClick={() => setExpectedType('advanced')}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer select-none flex flex-col justify-between relative ${
                      isSelected
                        ? 'bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-500 text-purple-950 shadow-md ring-2 ring-purple-400/40'
                        : 'bg-white border-slate-200 text-gray-600 hover:border-slate-300 hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-black text-sm flex items-center gap-1.5">
                        <span className="text-base">🟣</span> 応用・発展問題
                      </span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                        isSelected ? 'bg-purple-200 text-purple-900' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {count}問
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-gray-500">
                      条文全体の空欄を連続して解き進める実践形式
                    </p>
                  </button>
                );
              })()}
            </div>
          </div>

          <div className="bg-orange-50/50 border border-orange-100/80 p-5 rounded-3xl shadow-sm">
            <div className="flex items-center justify-between text-orange-900">
              <span className="text-xs font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-orange-600 shrink-0" />
                選択された条件に一致する問題数:
              </span>
              <span className="text-xl font-black font-mono text-orange-600 font-bold">
                {expectedHitCount} <span className="text-xs font-bold">件</span>
              </span>
            </div>
          </div>

          <button
            onClick={() => handleBeginExpectedQuiz(false)}
            className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-white font-extrabold rounded-2xl shadow-lg shadow-orange-500/20 text-center transition-all cursor-pointer text-sm flex items-center justify-center gap-2"
          >
            <span>選択した条件で予想問題を解き始める</span>
          </button>
        </div>
      )}

      {/* RENDER MODE: AI EXPECTED QUESTIONS */}
      {mode === 'ai' && (
        <div className="bg-white p-6 rounded-3xl border border-teal-50/50 shadow-xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center mx-auto mb-2 animate-bounce">
              <Sparkles className="w-6 h-6" />
            </div>
            <h4 className="font-extrabold text-gray-800 text-base">予測問題の難易度設定</h4>
            <p className="text-xs text-gray-500 leading-relaxed max-w-sm mx-auto">
              Gemini AIが養護教諭採用試験に頻出の法規、看護処置からオリジナル問題を生成します。難易度が高いほど、実戦的で深い理解を問う問題が出現します。
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
            <button
              onClick={() => setAiDifficulty('1')}
              className={`py-3 px-1 rounded-xl border-2 font-bold transition-all text-xs cursor-pointer text-center ${
                aiDifficulty === '1'
                  ? 'bg-emerald-50 border-emerald-400 text-emerald-800 ring-2 ring-emerald-400/10 scale-[1.02]'
                  : 'bg-white border-slate-200 text-gray-600 hover:border-slate-300'
              }`}
            >
              🐣 Lv.1
              <div className="text-[9px] text-gray-500 font-normal mt-0.5 whitespace-nowrap">初級 (基礎確認)</div>
            </button>
            <button
              onClick={() => setAiDifficulty('2')}
              className={`py-3 px-1 rounded-xl border-2 font-bold transition-all text-xs cursor-pointer text-center ${
                aiDifficulty === '2'
                  ? 'bg-teal-50 border-teal-400 text-teal-800 ring-2 ring-teal-400/10 scale-[1.02]'
                  : 'bg-white border-slate-200 text-gray-600 hover:border-slate-300'
              }`}
            >
              🌱 Lv.2
              <div className="text-[9px] text-gray-500 font-normal mt-0.5 whitespace-nowrap">初中級 (重要単語)</div>
            </button>
            <button
              onClick={() => setAiDifficulty('3')}
              className={`py-3 px-1 rounded-xl border-2 font-bold transition-all text-xs cursor-pointer text-center ${
                aiDifficulty === '3'
                  ? 'bg-sky-50 border-sky-400 text-sky-800 ring-2 ring-sky-400/10 scale-[1.02]'
                  : 'bg-white border-slate-200 text-gray-600 hover:border-slate-300'
              }`}
            >
              ⚔️ Lv.3
              <div className="text-[9px] text-gray-500 font-normal mt-0.5 whitespace-nowrap">中級 (標準・頻出)</div>
            </button>
            <button
              onClick={() => setAiDifficulty('4')}
              className={`py-3 px-1 rounded-xl border-2 font-bold transition-all text-xs cursor-pointer text-center ${
                aiDifficulty === '4'
                  ? 'bg-amber-50 border-amber-400 text-amber-800 ring-2 ring-amber-400/10 scale-[1.02]'
                  : 'bg-white border-slate-200 text-gray-600 hover:border-slate-300'
              }`}
            >
              🛡️ Lv.4
              <div className="text-[9px] text-gray-500 font-normal mt-0.5 whitespace-nowrap">中上級 (応用・発展)</div>
            </button>
            <button
              onClick={() => setAiDifficulty('5')}
              className={`py-3 px-1 rounded-xl border-2 font-bold transition-all text-xs cursor-pointer text-center ${
                aiDifficulty === '5'
                  ? 'bg-violet-50 border-violet-400 text-violet-800 ring-2 ring-violet-400/10 scale-[1.02]'
                  : 'bg-white border-slate-200 text-gray-600 hover:border-slate-300'
              }`}
            >
              🔥 Lv.5
              <div className="text-[9px] text-gray-500 font-normal mt-0.5 whitespace-nowrap">上級 (最難関合格)</div>
            </button>
          </div>

          <button
            onClick={() => onStartAiQuiz(aiDifficulty)}
            disabled={aiLoading}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400/60 text-white font-extrabold rounded-2xl shadow-lg shadow-indigo-600/10 flex items-center justify-center gap-2 transition-all cursor-pointer text-sm"
          >
            {aiLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Geminiがオリジナル問題を思考中...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                AI予想問題を生成してクイズ開始
              </>
            )}
          </button>
        </div>
      )}

        {/* AI Archive Section */}
        {mode === 'ai' && questions.filter(q => q.year === 'AI予想問題').length > 0 && (
          <div className="bg-white p-6 rounded-3xl border border-teal-50/50 shadow-xl space-y-4">
            <h4 className="font-extrabold text-gray-800 text-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              生成済みAI予想問題アーカイブ
            </h4>
            <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto">
              {questions.filter(q => q.year === 'AI予想問題').map(q => (
                <button
                  key={q.id}
                  onClick={() => onStartQuiz([q])}
                  className="text-left p-3 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors flex items-center justify-between group"
                >
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-xs font-bold text-gray-800 truncate">{q.field} - {q.prefecture}</span>
                    <span className="text-[10px] text-gray-500 truncate mt-0.5">{q.question.substring(0, 30)}...</span>
                  </div>
                  <div className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded-md whitespace-nowrap ml-2">
                    Lv.{q.difficulty}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

      {/* RENDER MODE: REVIEW FAILED */}
      {mode === 'review' && (
        <div className="bg-white p-6 rounded-3xl border border-teal-50/50 shadow-xl space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center flex-shrink-0">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-extrabold text-gray-800 text-base">苦手克服モード</h4>
              <p className="text-xs text-gray-500">復習する問題の種類を選んでスタート</p>
            </div>
          </div>

          {/* Filter selector */}
          <div className="space-y-3">
            {([
              {
                key: 'last_wrong' as ReviewFilter,
                label: '直近で間違えた問題',
                desc: '最後の回答が不正解だった問題',
                color: 'rose',
                badge: '⚡ 基本',
              },
              {
                key: 'repeated_wrong' as ReviewFilter,
                label: '繰り返し間違えている問題',
                desc: '直近2回以上連続で不正解の難問',
                color: 'orange',
                badge: '🔴 要注意',
              },
              {
                key: 'regressed' as ReviewFilter,
                label: '一度正解したのに間違えた問題',
                desc: '理解が定着していない危険な問題',
                color: 'amber',
                badge: '🟡 要定着',
              },
              {
                key: 'unattempted' as ReviewFilter,
                label: 'まだ解いていない問題',
                desc: '一度も挑戦していない未着手問題',
                color: 'teal',
                badge: '🟢 新規',
              },
              {
                key: 'bookmarked' as ReviewFilter,
                label: 'ブックマーク済みの問題',
                desc: 'あとで復習しようと保存した問題',
                color: 'amber',
                badge: '🔖 保存済み',
              },
            ] as const).map(({ key, label, desc, color, badge }) => {
              const count = getReviewFiltered(key).length;
              const selected = reviewFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => setReviewFilter(key)}
                  className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                    selected
                      ? `border-${color}-400 bg-${color}-50`
                      : 'border-gray-100 bg-gray-50 hover:border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        selected ? `border-${color}-500 bg-${color}-500` : 'border-gray-300'
                      }`}>
                        {selected && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-800">{label}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-white border border-gray-200 text-gray-500">{badge}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                      </div>
                    </div>
                    <span className={`text-lg font-black font-mono ml-2 flex-shrink-0 ${count === 0 ? 'text-gray-300' : selected ? `text-${color}-600` : 'text-gray-500'}`}>
                      {count}<span className="text-xs font-bold ml-0.5">問</span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <button
            onClick={handleBeginReviewQuiz}
            disabled={reviewFilteredCount === 0}
            className="w-full py-5 bg-rose-500 hover:bg-rose-600 active:scale-95 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-extrabold rounded-2xl shadow-xl shadow-rose-500/30 text-center transition-all duration-150 cursor-pointer text-base"
          >
            {reviewFilteredCount > 0
              ? `▶ ${reviewFilteredCount}問で弱点克服スタート！`
              : '該当する問題がありません'}
          </button>
        </div>
      )}
    </div>
  );
};
