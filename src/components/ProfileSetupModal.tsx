import React, { useState } from 'react';
import { motion } from 'motion/react';
import { GraduationCap, Sparkles, CheckCircle2, User, BookOpen, Clock, X } from 'lucide-react';
import { UserProfile } from '../types';

interface ProfileSetupModalProps {
  onSave: (profile: UserProfile) => Promise<void>;
  userEmail: string | null;
  initialProfile?: UserProfile | null;
  onClose?: () => void;
}

const COMMON_DEPARTMENTS = [
  '家政保健',
  '子ども心理',
  'その他'
];

const GRADES = [
  '1年',
  '2年',
  '3年',
  '4年',
  '大学院生',
  'その他'
];

export const ProfileSetupModal: React.FC<ProfileSetupModalProps> = ({ 
  onSave, 
  userEmail,
  initialProfile,
  onClose
}) => {
  const [grade, setGrade] = useState(initialProfile?.grade || '');
  const [department, setDepartment] = useState(() => {
    if (!initialProfile?.department) return '';
    if (COMMON_DEPARTMENTS.includes(initialProfile.department)) {
      return initialProfile.department;
    }
    return 'その他';
  });
  const [customDepartment, setCustomDepartment] = useState(() => {
    if (!initialProfile?.department) return '';
    if (COMMON_DEPARTMENTS.includes(initialProfile.department)) {
      return '';
    }
    return initialProfile.department;
  });
  const [diaryName, setDiaryName] = useState(initialProfile?.diaryName || '');
  const [dailyReminderTime, setDailyReminderTime] = useState(initialProfile?.dailyReminderTime || '20:00');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const finalDepartment = department === 'その他' ? customDepartment.trim() : department;

    if (!grade) {
      setError('学年を選択してください。');
      return;
    }
    if (!department || (department === 'その他' && !finalDepartment)) {
      setError('学科を選択または入力してください。');
      return;
    }
    if (!diaryName.trim()) {
      setError('日記ネーム（ニックネーム）を入力してください。');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        grade,
        department: finalDepartment,
        diaryName: diaryName.trim(),
        dailyReminderTime: dailyReminderTime || '20:00',
      });
    } catch (err) {
      setError('プロフィールの登録に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border-4 border-teal-100 relative overflow-hidden"
      >
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer z-10"
            title="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Decorative background gradients */}
        <div className="absolute -top-10 -left-10 w-24 h-24 bg-teal-50 rounded-full -z-10 opacity-60" />
        <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-pink-50 rounded-full -z-10 opacity-60" />

        <div className="text-center space-y-2 mb-6">
          <div className="inline-flex p-3 bg-teal-50 text-teal-600 rounded-2xl mb-2 shadow-inner">
            <GraduationCap className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center justify-center gap-1.5">
            {initialProfile ? 'プロフィール変更 🌸' : 'プロフィール設定 🌸'}
          </h2>
          <p className="text-xs text-slate-500 font-medium leading-relaxed">
            {initialProfile 
              ? '学年・学科・日記ネームを変更できます。変更内容は今後の解答履歴や公開ノートに反映されます。'
              : 'ようこそ！卒論研究の正確な集計と、自作マーカー機能の投稿者名として使用するため、最初のプロフィール情報を入力してください。'}
          </p>
          {userEmail && (
            <p className="inline-block px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold">
              ログインアカウント: {userEmail}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs font-bold text-rose-600 text-center animate-shake">
              {error}
            </div>
          )}

          {/* 学年選択 */}
          <div className="space-y-1.5">
            <label className="block text-xs font-black text-slate-700 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-teal-500" />
              現在の学年
            </label>
            <div className="grid grid-cols-3 gap-2">
              {GRADES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGrade(g)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                    grade === g
                      ? 'bg-teal-500 border-teal-500 text-white shadow-sm scale-[1.02]'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* 学科選択 */}
          <div className="space-y-1.5">
            <label className="block text-xs font-black text-slate-700 flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5 text-teal-500" />
              所属学科
            </label>
            <select
              value={department}
              onChange={(e) => {
                setDepartment(e.target.value);
                if (e.target.value !== 'その他') {
                  setCustomDepartment('');
                }
              }}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white font-bold text-slate-700"
            >
              <option value="">-- 学科を選択してください --</option>
              {COMMON_DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>

            {department === 'other' || department === 'その他' ? (
              <input
                type="text"
                placeholder="学科名を入力してください"
                value={customDepartment}
                onChange={(e) => setCustomDepartment(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white font-bold text-slate-700 mt-2"
              />
            ) : null}
          </div>

          {/* 日記ネーム（ニックネーム） */}
          <div className="space-y-1.5">
            <label className="block text-xs font-black text-slate-700 flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-teal-500" />
              日記ネーム（ニックネーム）
            </label>
            <input
              type="text"
              placeholder="例: みかん、さくら"
              value={diaryName}
              onChange={(e) => setDiaryName(e.target.value)}
              maxLength={20}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white font-bold text-slate-700"
            />
            <p className="text-[10px] text-slate-400 font-medium leading-relaxed pl-1">
              ※本名以外の匿名ニックネームを推奨します。他の公開問題の投稿者名として表示されます。
            </p>
          </div>

          {/* 通知リマインダー時間（dailyReminderTime） */}
          <div className="space-y-1.5 pt-1">
            <label className="block text-xs font-black text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-teal-500" />
                希望リマインダー通知時間（dailyReminderTime）
              </span>
              <span className="text-[10px] text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded-full border border-teal-100">
                日本時間 JST
              </span>
            </label>
            <div className="flex items-center gap-2">
              <input
                id="profileDailyReminderTimeInput"
                type="time"
                value={dailyReminderTime}
                onChange={(e) => setDailyReminderTime(e.target.value)}
                className="flex-1 px-3 py-2 text-sm font-mono font-bold border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-slate-700"
              />
              <div className="flex gap-1 shrink-0">
                {['07:00', '12:30', '20:00', '21:30'].map((timeStr) => (
                  <button
                    key={timeStr}
                    type="button"
                    onClick={() => setDailyReminderTime(timeStr)}
                    className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                      dailyReminderTime === timeStr
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {timeStr}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[10px] text-slate-400 font-medium leading-relaxed pl-1">
              毎日の学習リマインダー通知が届く時刻です。設定画面からもいつでも変更・更新できます。
            </p>
          </div>

          <div className="flex gap-3 mt-6">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black rounded-2xl text-sm transition-all active:scale-[0.98] cursor-pointer"
              >
                キャンセル
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className={`${onClose ? 'flex-[2]' : 'w-full'} py-3.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white font-black rounded-2xl shadow-lg hover:shadow-teal-100 text-sm transition-all disabled:opacity-50 active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer`}
            >
              {isSubmitting ? (
                <span>保存中...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  {initialProfile ? '変更を保存する' : 'プロフィールを登録して開始する'}
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
