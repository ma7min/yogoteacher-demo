import React, { useState } from 'react';
import { motion } from 'motion/react';
import { GraduationCap, Sparkles, CheckCircle2, X } from 'lucide-react';
import { UserProfile } from '../types';

interface ProfileSetupModalProps {
  onSave: (profile: UserProfile) => Promise<void>;
  userEmail: string | null;
  initialProfile?: UserProfile | null;
  onClose?: () => void;
}

const GRADES = [
  '1年',
  '2年',
  '3年',
  '4年',
  '大学院生',
  'その他'
];

// 文化祭展示版: 学科選択・ニックネーム入力・通知リマインダー設定は省略し、固定値を使用
const DEMO_DEPARTMENT = '文化祭ゲスト';
const DEMO_DIARY_NAME = 'ゲスト';
const DEMO_REMINDER_TIME = '20:00';

export const ProfileSetupModal: React.FC<ProfileSetupModalProps> = ({
  onSave,
  userEmail,
  initialProfile,
  onClose
}) => {
  const [grade, setGrade] = useState(initialProfile?.grade || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!grade) {
      setError('学年を選択してください。');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        grade,
        department: initialProfile?.department || DEMO_DEPARTMENT,
        diaryName: initialProfile?.diaryName || DEMO_DIARY_NAME,
        dailyReminderTime: initialProfile?.dailyReminderTime || DEMO_REMINDER_TIME,
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
            {initialProfile ? 'プロフィール変更 🌸' : 'ようこそ 🌸'}
          </h2>
          <p className="text-xs text-slate-500 font-medium leading-relaxed">
            {initialProfile
              ? '学年を変更できます。'
              : '文化祭展示版です。学年を選択するとすぐに始められます。'}
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
                  {initialProfile ? '変更を保存する' : 'はじめる'}
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
