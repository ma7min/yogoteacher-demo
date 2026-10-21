import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Calendar, Edit2, Check, X, MapPin, Cloud, RefreshCw } from 'lucide-react';
import { auth, db, isFirebaseMock } from '../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

export interface ExamInfo {
  prefecture: string;
  date: string;
}

interface ExamCountdownProps {
  initialExamInfo?: ExamInfo | null;
}

export const ExamCountdown: React.FC<ExamCountdownProps> = () => {
  const [examInfo, setExamInfo] = useState<ExamInfo | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [prefInput, setPrefInput] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'saving' | 'offline' | null>(null);

  // 1. ログイン状態の検知およびFirestoreからの同期取得
  useEffect(() => {
    let isMounted = true;

    // ローカルキャッシュから即時読み込み（画面のチラつき防止）
    try {
      const saved = localStorage.getItem('exam_target_info');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (isMounted) {
          setExamInfo(parsed);
          setPrefInput(parsed.prefecture || '');
          setDateInput(parsed.date || '');
        }
      }
    } catch (e) {
      console.warn("Failed to load local exam info", e);
    }

    if (isFirebaseMock || !auth) {
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!isMounted) return;
      setCurrentUser(user);

      if (user && db) {
        setIsSyncing(true);
        try {
          // ユーザー固有のローカルキャッシュがあれば優先反映
          const userLocalSaved = localStorage.getItem(`exam_target_info_${user.uid}`);
          if (userLocalSaved) {
            const parsed = JSON.parse(userLocalSaved);
            setExamInfo(parsed);
            setPrefInput(parsed.prefecture || '');
            setDateInput(parsed.date || '');
          }

          // Firestoreから目標試験日データを取得
          const userDocRef = doc(db, 'users', user.uid);
          const userDocSnap = await getDoc(userDocRef);

          let cloudExamInfo: ExamInfo | null = null;
          if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            if (data.examTarget && data.examTarget.prefecture && data.examTarget.date) {
              cloudExamInfo = {
                prefecture: data.examTarget.prefecture,
                date: data.examTarget.date,
              };
            }
          }

          // ユーザーステータス（status/profile）にも互換確認
          if (!cloudExamInfo) {
            const statusProfileRef = doc(db, `users/${user.uid}/status`, 'profile');
            const statusSnap = await getDoc(statusProfileRef);
            if (statusSnap.exists()) {
              const sData = statusSnap.data();
              if (sData.examTarget && sData.examTarget.prefecture && sData.examTarget.date) {
                cloudExamInfo = {
                  prefecture: sData.examTarget.prefecture,
                  date: sData.examTarget.date,
                };
              }
            }
          }

          if (cloudExamInfo) {
            // クラウドから取得できた場合、Stateとローカルキャッシュを更新
            setExamInfo(cloudExamInfo);
            setPrefInput(cloudExamInfo.prefecture);
            setDateInput(cloudExamInfo.date);
            localStorage.setItem('exam_target_info', JSON.stringify(cloudExamInfo));
            localStorage.setItem(`exam_target_info_${user.uid}`, JSON.stringify(cloudExamInfo));
            setSyncStatus('synced');
            setIsEditing(false);
          } else {
            // クラウドに未設定だがローカルに以前設定した試験日がある場合、自動的にクラウドへアップロード保存
            const currentLocal = localStorage.getItem('exam_target_info');
            if (currentLocal) {
              try {
                const parsed = JSON.parse(currentLocal);
                if (parsed.prefecture && parsed.date) {
                  await setDoc(userDocRef, {
                    examTarget: parsed,
                    updatedAt: serverTimestamp()
                  }, { merge: true });
                  setSyncStatus('synced');
                }
              } catch (err) {}
            } else {
              // どこにも設定がない場合、編集フォームを開く
              setIsEditing(true);
            }
          }
        } catch (err) {
          console.error("Failed to sync exam info with Firestore:", err);
          setSyncStatus('offline');
        } finally {
          if (isMounted) setIsSyncing(false);
        }
      } else {
        // 未ログインの場合
        const saved = localStorage.getItem('exam_target_info');
        if (!saved) {
          setIsEditing(true);
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // 2. 保存処理（ローカルキャッシュ＋Firestoreクラウド保存）
  const handleSave = async () => {
    if (!prefInput.trim() || !dateInput) return;
    const newInfo: ExamInfo = { prefecture: prefInput.trim(), date: dateInput };
    
    setExamInfo(newInfo);
    setIsEditing(false);

    // ローカルキャッシュ保存
    try {
      localStorage.setItem('exam_target_info', JSON.stringify(newInfo));
      if (currentUser?.uid) {
        localStorage.setItem(`exam_target_info_${currentUser.uid}`, JSON.stringify(newInfo));
      }
    } catch (e) {
      console.warn("Local storage save error", e);
    }

    // Firestore（アカウント）に保存
    if (currentUser && db && !isFirebaseMock) {
      setSyncStatus('saving');
      try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        await setDoc(userDocRef, {
          examTarget: newInfo,
          updatedAt: serverTimestamp()
        }, { merge: true });

        // プロファイルステータスドキュメントにもバックアップ保存
        const statusProfileRef = doc(db, `users/${currentUser.uid}/status`, 'profile');
        await setDoc(statusProfileRef, {
          examTarget: newInfo,
          updatedAt: serverTimestamp()
        }, { merge: true });

        setSyncStatus('synced');
      } catch (err) {
        console.error("Failed to save exam target to Firestore:", err);
        setSyncStatus('offline');
      }
    }
  };

  const calculateDaysLeft = (targetDateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(targetDateStr);
    target.setHours(0, 0, 0, 0);
    const diffTime = target.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  if (isEditing) {
    return (
      <div className="bg-white p-5 rounded-3xl border border-teal-50/50 shadow-md mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-teal-600" />
            <h4 className="font-bold text-gray-800 text-sm">目標試験日の設定</h4>
          </div>
          {currentUser && (
            <span className="text-[10px] font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Cloud className="w-3 h-3" />
              アカウントに保存・全端末で同期
            </span>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-500 mb-1">志望自治体</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                value={prefInput}
                onChange={e => setPrefInput(e.target.value)}
                placeholder="例: 栃木県、東京都など"
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-gray-700 outline-none focus:border-teal-400 focus:bg-white transition-colors"
              />
            </div>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-500 mb-1">試験日</label>
            <input 
              type="date" 
              value={dateInput}
              onChange={e => setDateInput(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-gray-700 outline-none focus:border-teal-400 focus:bg-white transition-colors"
            />
          </div>
          <div className="flex items-end pb-0.5 gap-2">
            <button 
              onClick={handleSave}
              disabled={!prefInput.trim() || !dateInput}
              className="px-4 py-2.5 bg-teal-500 hover:bg-teal-600 text-white rounded-xl font-bold text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
            >
              <Check className="w-4 h-4" /> 設定を保存
            </button>
            {examInfo && (
              <button 
                onClick={() => setIsEditing(false)}
                className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!examInfo) return null;

  const daysLeft = calculateDaysLeft(examInfo.date);
  const isPast = daysLeft < 0;
  const isToday = daysLeft === 0;

  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-r from-teal-500 to-emerald-500 p-4 rounded-2xl shadow-lg shadow-teal-500/20 text-white mb-4 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-4"
    >
      <div className="absolute -right-6 -top-6 text-white/10">
        <Calendar className="w-24 h-24" />
      </div>
      
      <div className="relative z-10 flex flex-col sm:flex-row items-center gap-3 text-center sm:text-left">
        <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
          <Calendar className="w-6 h-6 text-white" />
        </div>
        <div>
          <div className="text-teal-50 text-[9px] font-bold mb-0.5 tracking-wider uppercase flex items-center justify-center sm:justify-start gap-1.5">
            <span>試験日まで</span>
            {isSyncing ? (
              <span className="inline-flex items-center gap-0.5 text-[8px] bg-white/20 px-1.5 py-0.2 rounded text-white font-medium">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" /> 同期中
              </span>
            ) : currentUser ? (
              <span className="inline-flex items-center gap-0.5 text-[8px] text-teal-100/90 font-medium" title="アカウントと同期済み">
                <Cloud className="w-2.5 h-2.5" />
              </span>
            ) : null}
          </div>
          <h3 className="text-base font-black tracking-tight flex items-center gap-2 justify-center sm:justify-start">
            {examInfo.prefecture} <span className="text-teal-100 font-medium text-[10px]">({examInfo.date.replace(/-/g, '/')})</span>
          </h3>
        </div>
      </div>

      <div className="relative z-10 flex items-center gap-4">
        <div className="text-center">
          {isPast ? (
            <div className="text-xl font-black tracking-tighter">試験終了</div>
          ) : isToday ? (
            <div className="text-2xl font-black tracking-tighter text-yellow-300 drop-shadow-md animate-pulse">本日が試験日です！</div>
          ) : (
            <div className="flex items-baseline gap-1">
              <span className="text-xs font-bold text-teal-100">あと</span>
              <span className="text-4xl font-black tracking-tighter drop-shadow-md">{daysLeft}</span>
              <span className="text-xs font-bold text-teal-100">日</span>
            </div>
          )}
        </div>
        
        <button 
          onClick={() => {
            setPrefInput(examInfo.prefecture);
            setDateInput(examInfo.date);
            setIsEditing(true);
          }}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-xl backdrop-blur-sm transition-colors text-white/80 hover:text-white cursor-pointer"
          title="試験日を変更する"
        >
          <Edit2 className="w-3 h-3" />
        </button>
      </div>
    </motion.div>
  );
};

