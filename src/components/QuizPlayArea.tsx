import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, X, Award, ChevronRight, HelpCircle, AlertCircle, RefreshCw, BookOpen, Clock, Activity, CornerDownRight, Bookmark } from 'lucide-react';
import { Question, formatKouAndGou, formatBlanks } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface QuizPlayAreaProps {
  filteredQuestions: Question[];
  onFinishQuiz: (finalHistory: Record<string | number, boolean>) => void;
  onGoBack: (partialHistory?: Record<string | number, boolean>, currentIndex?: number) => void;
  onAnswerQuestion: (problemId: string | number, isCorrect: boolean) => void;
  userEmail: string | null;
  resumeState?: {
    currentIndex: number;
    correctCount: number;
    sessionHistory: Record<string | number, boolean>;
  } | null;
  bookmarks?: Set<string | number>;
  onToggleBookmark?: (id: string | number) => void;
}

interface QuizStep {
  question: Question;
  label: string;
  targetPlaceholder: string;
}

interface QuizGroup {
  id: string | number;
  year?: string;
  prefecture?: string;
  field: string;
  difficulty: string | number;
  commonQuestionText: string;
  steps: QuizStep[];
}

// 改良された問題本文正規化とプレースホルダー検索ロジック
const getQuestionSkeleton = (q: Question): string => {
  const prefix = `${q.year}_${q.prefecture}_${q.field}_`;
  const brIdx = q.question.indexOf('<br>');
  let mainText = brIdx !== -1 ? q.question.substring(brIdx + 4) : q.question;
  
  // 英数字、仮名、プレースホルダー括弧等を除去して骨格だけにする
  return prefix + mainText
    .replace(/\[\s*[a-zA-Z0-9]\s*\]/gi, '')
    .replace(/\[　*[a-zA-Z0-9]　*\]/gi, '')
    .replace(/\[\s*[ア-ン①-⑨]\s*\]/g, '')
    .replace(/\[　*[ア-ン①-⑨]　*\]/g, '')
    .replace(/[（(]\s*[a-zA-Z0-9ア-ン①-⑨]\s*[）)]/g, '')
    .replace(/[（(]　*[a-zA-Z0-9ア-ン①-⑨]　*[）)]/g, '')
    .replace(/[　\s()[\]（）|｜、。，．_]/g, '')
    .toLowerCase();
};

const findTargetPlaceholder = (questionText: string): { label: string; placeholder: string } | null => {
  const brIdx = questionText.indexOf('<br>');
  const intro = brIdx !== -1 ? questionText.substring(0, brIdx) : questionText;
  const body = brIdx !== -1 ? questionText.substring(brIdx) : questionText;
  
  // 1. まずは英数字や記号（①, a, b, ア, イ等がある複数空欄向け）をチェック
  const patterns = [
    /空欄\s*[\[［\(（]\s*([a-zA-Z0-9ア-ン①-⑳一-龠])\s*[\]］\)）]/,
    /文中の\s*[\[［\(（]\s*([a-zA-Z0-9ア-ン①-⑳一-龠])\s*[\]］\)）]/,
    /[\[［\(（]\s*([a-zA-Z0-9ア-ン①-⑳一-龠])\s*[\]］\)）]\s*(に当てはまる|にあてはまる|に適した|には)/,
    /[［（\[\(]\s*([①-⑳a-zA-Z0-9])\s*[］）\]\)]/
  ];
  
  for (const pat of patterns) {
    const match = intro.match(pat);
    if (match) {
      const char = match[1];
      const label = `［${char}］`;
      
      const escapedChar = char.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const bodyPatterns = [
        new RegExp(`\\[\\s*${escapedChar}\\s*\\]`, 'i'),
        new RegExp(`\\[　*${escapedChar}　*\\]`, 'i'),
        new RegExp(`（\\s*${escapedChar}\\s*）`, 'i'),
        new RegExp(`（　*${escapedChar}　*）`, 'i'),
        new RegExp(`\\(\\s*${escapedChar}\\s*\\)`, 'i'),
        new RegExp(`\\(　*${escapedChar}　*\\)`, 'i'),
        new RegExp(`［\\s*${escapedChar}\\s*］`, 'i'),
        new RegExp(`［　*${escapedChar}　*］`, 'i')
      ];
      
      for (const bPat of bodyPatterns) {
        const bMatch = body.match(bPat);
        if (bMatch) {
          return { label, placeholder: bMatch[0] };
        }
      }
    }
  }

  // 2. 文字のない裸の「（　　）」「(　　)」「[　　]」「＿＿＿＿」などの単一空欄を検索
  const nakedSet = [
    /（\s*）/,
    /（　*）/,
    /\(\s*\)/,
    /\(　*\)/,
    /\[\s*\]/,
    /\[　*\]/,
    /［\s*］/,
    /［　*］/,
    /_{2,}/,
    /＿{2,}/
  ];
  for (const nPat of nakedSet) {
    const bMatch = body.match(nPat);
    if (bMatch) {
      return { label: "", placeholder: bMatch[0] };
    }
  }
  
  return null;
};

const buildQuizGroups = (questions: Question[]): QuizGroup[] => {
  const groups: QuizGroup[] = [];
  
  questions.forEach((q) => {
    const skel = getQuestionSkeleton(q);
    const placeholderInfo = findTargetPlaceholder(q.question);
    
    const step: QuizStep = {
      question: q,
      label: placeholderInfo?.label.replace('空欄', '') || "",
      targetPlaceholder: placeholderInfo?.placeholder || ""
    };
    
    const lastGroup = groups[groups.length - 1];
    
    // 同一自治体、同一年度、同一分野で、骨格が完全に一致するものを自動グループ化
    if (false) {
      lastGroup.steps.push(step);
    } else {
      groups.push({
        id: q.id,
        year: q.year,
        prefecture: q.prefecture,
        field: q.field,
        difficulty: q.difficulty,
        commonQuestionText: q.question,
        steps: [step]
      });
    }
  });
  
  return groups;
};

export const QuizPlayArea: React.FC<QuizPlayAreaProps> = ({
  filteredQuestions,
  onFinishQuiz,
  onGoBack,
  onAnswerQuestion,
  userEmail,
  resumeState,
  bookmarks,
  onToggleBookmark
}) => {
  // グループ化を適用
  const quizGroups = useMemo(() => {
    return buildQuizGroups(filteredQuestions);
  }, [filteredQuestions]);

  const totalSteps = filteredQuestions.length; // 全小問の合計数

  // レジューム位置のデコード
  const initialIndices = useMemo(() => {
    if (!resumeState || quizGroups.length === 0) {
      return { groupIdx: 0, stepIdx: 0 };
    }
    const targetQ = filteredQuestions[resumeState.currentIndex];
    if (!targetQ) {
      return { groupIdx: 0, stepIdx: 0 };
    }
    const gIdx = quizGroups.findIndex(g => g.steps.some(s => s.question.id === targetQ.id));
    if (gIdx !== -1) {
      const sIdx = quizGroups[gIdx].steps.findIndex(s => s.question.id === targetQ.id);
      return { groupIdx: gIdx, stepIdx: sIdx !== -1 ? sIdx : 0 };
    }
    return { groupIdx: 0, stepIdx: 0 };
  }, [resumeState, quizGroups, filteredQuestions]);

  const [currentIndex, setCurrentIndex] = useState(initialIndices.groupIdx);
  const [currentStepIndex, setCurrentStepIndex] = useState(initialIndices.stepIdx);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [descriptiveInput, setDescriptiveInput] = useState("");
  const [isAnswered, setIsAnswered] = useState(false);
  const [correctCount, setCorrectCount] = useState(resumeState?.correctCount || 0);
  const [sessionHistory, setSessionHistory] = useState<Record<string | number, boolean>>(resumeState?.sessionHistory || {});
  const [showFinishedScreen, setShowFinishedScreen] = useState(false);

  // レジューム時のステート同期
  React.useEffect(() => {
    setCurrentIndex(initialIndices.groupIdx);
    setCurrentStepIndex(initialIndices.stepIdx);
    setSelectedChoice(null);
    setIsAnswered(false);
    setDescriptiveInput("");
  }, [initialIndices]);

  // 進捗または画面切替時にスムーズに上部へスクロール
  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentIndex, currentStepIndex, showFinishedScreen]);

  if (filteredQuestions.length === 0 || quizGroups.length === 0) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center text-gray-500 font-bold">
        該当する問題が見つかりませんでした。再度条件を設定してください。
      </div>
    );
  }

  const currentGroup = quizGroups[currentIndex] || quizGroups[0];
  const currentStep = currentGroup.steps[currentStepIndex] || currentGroup.steps[0];
  const currentQ = currentStep.question;

  // 全体での何番目の小問かを算出
  let activeQuestionNumber = 1;
  let solvedStepsCount = 0;
  for (let i = 0; i < currentIndex; i++) {
    solvedStepsCount += quizGroups[i].steps.length;
  }
  activeQuestionNumber = solvedStepsCount + currentStepIndex + 1;

  // Answer Submission Logic
  
  const handleDescriptiveSubmit = () => {
    if (isAnswered || !descriptiveInput.trim()) return;
    setIsAnswered(true);

    const correctAnswerStr = currentQ.choices[currentQ.answer - 1] || "";

    const normalize = (str: string) => {
      return str
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
        .replace(/[（\(]/g, '(')
        .replace(/[）\)]/g, ')')
        .replace(/\s+/g, '')
        .toLowerCase();
    };

    // 正解の判定候補リストを作成（「青森県（リンゴが有名）」の場合、「青森県」のみでも正解にする）
    const getAcceptableAnswers = (ansStr: string) => {
      const list = new Set<string>();
      if (!ansStr) return list;

      const normAns = normalize(ansStr);
      list.add(normAns);

      // 1. カッコとその中身を取り除いた文字列 (例: "青森県(リンゴが有名)" -> "青森県", "睡眠の短縮(早朝覚醒など)" -> "睡眠の短縮")
      const withoutParen = normalize(ansStr.replace(/[（\(][^）\)]*[）\)]/g, ''));
      if (withoutParen && withoutParen !== normAns) {
        list.add(withoutParen);
      }

      // 2. カッコの中身だけを入力した場合 (例: "早朝覚醒など")
      const matches = ansStr.match(/[（\(]([^）\)]*)[）\)]/g);
      if (matches) {
        matches.forEach(m => {
          const inner = normalize(m.replace(/[（\(\)）]/g, ''));
          if (inner) list.add(inner);
        });
      }

      // 3. スラッシュで区切られた並記がある場合 (例: "スクールカウンセラー／スクールソーシャルワーカー")
      if (ansStr.includes('／') || ansStr.includes('/')) {
        const parts = ansStr.split(/[／\/]/).map(p => normalize(p)).filter(Boolean);
        parts.forEach(p => list.add(p));
        list.add(parts.join(''));
      }

      return list;
    };

    const acceptable = getAcceptableAnswers(correctAnswerStr);
    const normInput = normalize(descriptiveInput);
    const normInputWithoutParen = normalize(descriptiveInput.replace(/[（\(][^）\)]*[）\)]/g, ''));

    const isCorrect = acceptable.has(normInput) || (normInputWithoutParen ? acceptable.has(normInputWithoutParen) : false);
    
    if (isCorrect) {
      setCorrectCount(prev => prev + 1);
    }
    setSessionHistory(prev => ({ ...prev, [currentQ.id]: isCorrect }));
    onAnswerQuestion(currentQ.id, isCorrect);

    try {
      const savedHistory = JSON.parse(localStorage.getItem('local_answers_history') || '{}');
      savedHistory[currentQ.id] = isCorrect;
      localStorage.setItem('local_answers_history', JSON.stringify(savedHistory));
    } catch (e) {}
  };

  const handleChoiceSubmit = async (choiceNum: number) => {
    if (isAnswered) return;
    setSelectedChoice(choiceNum);
    setIsAnswered(true);

    const isCorrect = choiceNum === currentQ.answer;
    
    // Track stats
    if (isCorrect) {
      setCorrectCount(prev => prev + 1);
    }

    setSessionHistory(prev => ({ ...prev, [currentQ.id]: isCorrect }));

    // Notify parent immediately for real-time Firestore sync
    onAnswerQuestion(currentQ.id, isCorrect);

    // Local demo persistence in localStorage
    try {
      const savedHistory = JSON.parse(localStorage.getItem('local_answers_history') || '{}');
      savedHistory[currentQ.id] = isCorrect;
      localStorage.setItem('local_answers_history', JSON.stringify(savedHistory));
    } catch (e) {
      console.error("Local storage sync error", e);
    }
  };

  // Skip / Next Question Logic
  const handleNext = () => {
    setSelectedChoice(null);
    setIsAnswered(false);
    setDescriptiveInput("");

    // 同一グループにまだ次のステップ（空欄）がある場合
    if (currentStepIndex + 1 < currentGroup.steps.length) {
      setCurrentStepIndex(prev => prev + 1);
    } 
    // グループ全体のすべての空欄を解き終わったとき、次の問題へ進む
    else {
      if (currentIndex + 1 >= quizGroups.length) {
        setShowFinishedScreen(true);
      } else {
        setCurrentIndex(prev => prev + 1);
        setCurrentStepIndex(0);
      }
    }
  };

  // Complete Game Session
  const handleFinishAndReturn = () => {
    onFinishQuiz(sessionHistory);
  };

  // Finish state statistics
  const scoreRate = totalSteps > 0 ? (correctCount / totalSteps) * 100 : 0;

  // 問題本文のプレースホルダーを置換して強調ハイライト
  const renderQuestionText = () => {
    // 常に「現在解答しているステップの実際の問題文」をベースにして、
    // 指示文（intro）と本文（body）に正しく分離させる
    let questionText = currentGroup.steps[currentStepIndex].question.question;
    const brIdx = questionText.indexOf('<br>');
    
    // <br>がある場合は、指示文（intro）と本文（body）に分ける
    // <br>がない場合は全体を本文（body）として扱う
    let intro = brIdx !== -1 ? questionText.substring(0, brIdx) : "";
    let body = brIdx !== -1 ? questionText.substring(brIdx) : questionText;
    
    // 項・号の自動改行を追加!
    body = formatKouAndGou(body);

    const isSingleBlankGroup = currentGroup.steps.length === 1;

    // 本文に2つ以上の空欄（文字あり or 空欄）が含まれているかチェックする
    const bodyBlanksCount = (body.match(/[（(\[［]\s*[a-zA-Z0-9ア-ン①-⑨一-龠]?\s*[）)\]］]|_{2,}|＿{2,}/g) || []).length;
    const hasMultipleBlanks = currentGroup.steps.length > 1 || bodyBlanksCount > 1;

    // 空欄にラベル(a, b...)を付与して整合性をとる
    intro = formatBlanks(intro);

    const isNotApplyQuestion = /あてはまらない|該当しない|適切でない/.test(questionText);

    currentGroup.steps.forEach((step, sIdx) => {
      if (!step.targetPlaceholder) return;
      
      let labelContent = step.label.replace(/[［］（）]/g, '');
      // 問題の（　　）がひとつの場合は中身の文字や数字は消す
      if (!hasMultipleBlanks) {
        labelContent = "";
      }
      
      const displayVal = isNotApplyQuestion 
        ? `（　${labelContent}　）` 
        : `<span class="font-black">（　${labelContent}　）</span>`;

      // 複数同位置に現れる同一 placeholder を一括置換するためのヘルパー
      const replaceAll = (str: string, search: string, replacement: string) => {
        if (!search) return str;
        return str.split(search).join(replacement);
      };

      if (sIdx === currentStepIndex) {
        // 現在解答中のプレースホルダー（問われている部分：文字を残し、十分な隙間を入れて目立たせる）
        const highlightHtml = isNotApplyQuestion 
          ? `<span class="inline-flex items-center mx-1 font-bold text-teal-700 decoration-teal-600 underline decoration-2">${displayVal}</span>`
          : `<span class="inline-flex items-center px-3 py-0.5 min-w-[3rem] justify-center bg-teal-100 border-2 border-teal-600 text-teal-950 rounded-md font-bold shadow mx-1 ring-2 ring-teal-500/30 animate-pulse scale-105 transition-transform">${displayVal}</span>`;
        body = replaceAll(body, step.targetPlaceholder, highlightHtml);
      } else {
        // 解答済み、または未解答のプレースホルダーは光らせず（バッジ化もせず）通常表示とする
        body = replaceAll(body, step.targetPlaceholder, displayVal);
      }
    });

    const combinedHtml = `${intro}${body}`;
    return <span dangerouslySetInnerHTML={{ __html: combinedHtml }} />;
  };

  // Finished Screen UI
  if (showFinishedScreen) {
    return (
      <div className="max-w-xl mx-auto py-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-8 rounded-3xl border border-teal-50/50 shadow-2xl text-center space-y-6 relative overflow-hidden"
        >
          {/* Decorative Finish Background */}
          <div className="absolute inset-0 bg-gradient-to-b from-teal-500/5 to-transparent pointer-events-none" />
          
          <div className="w-20 h-20 bg-teal-50 text-teal-500 rounded-full flex items-center justify-center mx-auto mb-4 relative z-10 shadow-lg shadow-teal-500/5">
            <Award className="w-10 h-10 animate-bounce" />
          </div>

          <div className="space-y-1 relative z-10">
            <h3 className="text-2xl font-black text-teal-800">試験演習が終了しました！</h3>
            <p className="text-xs text-gray-500">お疲れ様でした。今回の解答結果です。</p>
          </div>

          {/* Results dashboard metrics */}
          <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto pt-4 relative z-10">
            <div className="bg-slate-50 p-4 rounded-2xl border border-teal-50/20">
              <span className="text-[10px] font-bold text-gray-400 block uppercase tracking-wider mb-1">正解率</span>
              <span className="text-3xl font-black text-teal-600 font-mono">
                {scoreRate.toFixed(1)}
                <span className="text-xs font-bold">%</span>
              </span>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-teal-50/20">
              <span className="text-[10px] font-bold text-gray-400 block uppercase tracking-wider mb-1">正解数</span>
              <span className="text-3xl font-black text-teal-700 font-mono">
                {correctCount} <span className="text-xs text-teal-600 font-bold">/ {totalSteps}問</span>
              </span>
            </div>
          </div>

          {/* Encouragement message standard Yogo theme */}
          <div className="p-4 bg-emerald-50 text-emerald-800 text-xs font-semibold rounded-2xl max-w-sm mx-auto leading-relaxed border border-emerald-100">
            {scoreRate >= 85 
              ? "素晴らしい！合格ラインに到達しています。自信を持って次のテーマへ進みましょう。🏫✨"
              : scoreRate >= 60 
              ? "非常に手応えのある正答率です。間違えた部分の解説をよく読んで再挑戦してみましょう！📖✍️"
              : "まずは法律や規則を整理することから。間違いこそ最大の教科書になります。頑張るあなたを応援しています。🌸"}
          </div>

          <button
            onClick={handleFinishAndReturn}
            className="w-full py-4 bg-teal-500 hover:bg-teal-600 text-white font-extrabold rounded-2xl shadow-lg shadow-teal-500/20 transition-all cursor-pointer text-sm"
          >
            ダッシュボードに戻る
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      {/* Quiz Progress Top Deck */}
      <div className="bg-white p-4 rounded-2xl border border-teal-100/60 shadow-md space-y-2.5">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="flex items-center gap-1.5 text-teal-700">
            <Clock className="w-4 h-4 text-teal-500 shrink-0" />
            第 <span className="font-mono text-base font-black text-teal-600">{activeQuestionNumber}</span> 問 / 全 {totalSteps} 問
          </span>
          <span className={`py-1 px-2.5 rounded-full text-[10px] font-black ${
            activeQuestionNumber === totalSteps
              ? 'bg-amber-100 text-amber-700'
              : 'bg-teal-50 text-teal-600'
          }`}>
            {activeQuestionNumber === totalSteps ? '🏁 ラスト問題！' : `${Math.round(((activeQuestionNumber - 1) / totalSteps) * 100)}% 完了`}
          </span>
        </div>
        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-teal-400 to-emerald-400 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${((activeQuestionNumber - 1) / totalSteps) * 100}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Primary Quiz Card */}
      <div className="bg-white p-6 md:p-8 rounded-3xl border border-teal-50/50 shadow-xl space-y-6 relative overflow-hidden">

        {/* Meta tags + bookmark */}
        <div className="flex items-start gap-2 pb-4 border-b border-gray-100">
          <div className="flex flex-wrap items-center gap-1.5 flex-1 text-[10px] font-extrabold uppercase tracking-wider text-teal-600">
            <BookOpen className="w-3.5 h-3.5 text-teal-500" />
            <span>出題元: {currentGroup.year} {currentGroup.prefecture}</span>
            <span className="text-gray-300">|</span>
            <span>分野: {currentGroup.field || "未分類"}</span>
            <span className="text-gray-300">|</span>
            <span>レベル: {(() => {
              const num = parseInt(currentGroup.difficulty, 10);
              if (isNaN(num) || num < 1 || num > 5) return currentGroup.difficulty || 'レベル設定なし';
              const stars = '★'.repeat(num) + '☆'.repeat(5 - num);
              const labels: Record<string, string> = {
                '1': '初級（基礎確認）',
                '2': '初中級（重要単語）',
                '3': '中級（標準・頻出）',
                '4': '中上級（応用・発展）',
                '5': '上級（最難関合格）'
              };
              return `${stars} ${labels[currentGroup.difficulty] || '中級（標準・頻出）'}`;
            })()}</span>
          </div>
          {onToggleBookmark && (
            <button
              onClick={() => onToggleBookmark(currentGroup.id)}
              className={`shrink-0 p-1.5 rounded-lg transition-colors ${bookmarks?.has(currentGroup.id) ? 'text-amber-500 bg-amber-50' : 'text-gray-300 hover:text-amber-400 hover:bg-amber-50'}`}
              title={bookmarks?.has(currentGroup.id) ? 'ブックマーク解除' : 'ブックマーク登録'}
            >
              <Bookmark className={`w-4 h-4 ${bookmarks?.has(currentGroup.id) ? 'fill-amber-500' : ''}`} />
            </button>
          )}
        </div>

        {/* Question Paragraph with Highlight replacements */}
        <div className="space-y-4">
          <div className="text-teal-900 font-bold text-sm md:text-base leading-relaxed flex items-start gap-2">
            <span className="bg-teal-100 text-teal-800 w-6 h-6 rounded-lg text-xs flex items-center justify-center font-black shrink-0 mt-0.5 font-mono">
              Q
            </span>
            <div className="flex-1">
              {renderQuestionText()}
            </div>
          </div>
        </div>

                {/* Choices Column or Descriptive Input */}
        {currentQ.type === 'advanced' ? (
          <div className="space-y-4">
            <input
              type="text"
              value={descriptiveInput}
              onChange={(e) => setDescriptiveInput(e.target.value)}
              disabled={isAnswered}
              placeholder="答えを入力してください"
              className="w-full p-4 rounded-xl border border-teal-200 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-shadow text-center text-lg"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleDescriptiveSubmit();
              }}
            />
            <button
              onClick={handleDescriptiveSubmit}
              disabled={isAnswered || !descriptiveInput.trim()}
              className="w-full p-4 rounded-xl bg-teal-600 text-white font-bold disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              回答する
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
          {currentQ.choices.map((choice, idx) => {
            const choiceNum = idx + 1;
            const isSelected = selectedChoice === choiceNum;
            const isCorrectAnswer = choiceNum === currentQ.answer;

            // Coloring condition after answer
            let blockClass = 'border-slate-200/80 bg-white text-gray-700 hover:border-teal-300 hover:bg-teal-50/20';
            let circleClass = 'border-slate-300 text-gray-400 font-semibold';

            if (isAnswered) {
              if (isCorrectAnswer) {
                // Correct Choice always green highlight after answered
                blockClass = 'border-emerald-300 bg-emerald-50/40 text-emerald-900 font-bold ring-2 ring-emerald-200/40';
                circleClass = 'bg-emerald-500 border-emerald-500 text-white';
              } else if (isSelected) {
                // Selected Incorrect Choice turns red
                blockClass = 'border-[#ff6f94] bg-[#ff6f94]/10 text-[#ff6f94] font-bold ring-2 ring-[#ff6f94]/20';
                circleClass = 'bg-[#ff6f94] border-[#ff6f94] text-white';
              } else {
                // Other choices dimmed
                blockClass = 'border-slate-100 bg-slate-50/30 text-gray-400 opacity-60';
                circleClass = 'border-slate-200 text-slate-300';
              }
            }

            return (
              <button
                key={idx}
                disabled={isAnswered}
                onClick={() => handleChoiceSubmit(choiceNum)}
                className={`w-full flex items-center gap-3.5 p-4 rounded-xl border text-left transition-all group focus:outline-none ${blockClass}`}
              >
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center border font-mono text-xs shrink-0 transition-colors ${circleClass}`}>
                  {isAnswered && isCorrectAnswer ? (
                    <Check className="w-4 h-4 stroke-[3]" />
                  ) : isAnswered && isSelected ? (
                    <X className="w-4 h-4 stroke-[3]" />
                  ) : (
                    choiceNum
                  )}
                </div>
                <span className="text-xs md:text-sm leading-relaxed">{choice}</span>
              </button>
            );
          })}
          </div>
        )}
        {/* FEEDBACK & EXPLANATIONS (Smoothly visible after answered) */}
        <AnimatePresence>
          {isAnswered && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              className="space-y-4 pt-4 border-t border-gray-100"
            >
              {/* 正誤判定 */}
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className={`p-4 rounded-2xl flex items-center gap-4 ${
                  sessionHistory[currentQ.id] === true
                    ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-300'
                    : 'bg-gradient-to-r from-rose-50 to-pink-50 border-2 border-[#ff6f94]/50'
                }`}
              >
                {sessionHistory[currentQ.id] === true ? (
                  <>
                    <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/30">
                      <Check className="w-6 h-6 stroke-[3]" />
                    </div>
                    <div>
                      <p className="font-black text-emerald-800 text-sm">🎉 正解！すばらしい！</p>
                      <p className="text-emerald-700 text-xs font-bold mt-0.5">正解：{currentQ.choices[currentQ.answer - 1]}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-10 h-10 rounded-full bg-[#ff6f94] text-white flex items-center justify-center shrink-0 shadow-md shadow-[#ff6f94]/30">
                      <X className="w-6 h-6 stroke-[3]" />
                    </div>
                    <div>
                      <p className="font-black text-[#c0375a] text-sm">😢 不正解...</p>
                      <p className="text-[#c0375a] text-xs font-bold mt-0.5">正解：{currentQ.choices[currentQ.answer - 1]}</p>
                    </div>
                  </>
                )}
              </motion.div>
              {/* 大問全体の最後のステップが完了した場合のみ、または全体共通の解説を表示 */}
              <div className="p-5 bg-slate-50 border border-slate-100 rounded-2xl space-y-2">
                <span className="text-[10px] font-extrabold text-teal-700 tracking-wider flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5 text-teal-500" />
                  解説・根拠
                </span>
                <p 
                  className="text-xs text-slate-600 leading-relaxed font-medium"
                  dangerouslySetInnerHTML={{ __html: currentQ.explanation.replace(/\n/g, '<br/>') }}
                />
              </div>

              {/* Action: Next button */}
              <button
                onClick={handleNext}
                className="w-full py-4 bg-teal-500 hover:bg-teal-600 text-white font-extrabold rounded-2xl shadow-md shadow-teal-500/10 flex items-center justify-center gap-2 transition-all cursor-pointer text-sm"
              >
                {currentStepIndex + 1 < currentGroup.steps.length ? (
                  <>
                    次の空欄解答へ進む
                    <ChevronRight className="w-4 h-4 shrink-0 animate-pulse" />
                  </>
                ) : activeQuestionNumber === totalSteps ? (
                  "結果を見る"
                ) : (
                  "次の問題へ進む"
                )}
                {currentStepIndex + 1 >= currentGroup.steps.length && (
                  <ChevronRight className="w-4 h-4 shrink-0" />
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Give up back button */}
      {!isAnswered && (
        <div className="text-center">
          <button
            onClick={() => onGoBack(sessionHistory, activeQuestionNumber - 1)}
            className="text-xs text-[#ff6f94]/70 hover:text-[#ff6f94] font-bold cursor-pointer transition-all focus:outline-none"
          >
            演習を中止して終了する
          </button>
        </div>
      )}
    </div>
  );
};

