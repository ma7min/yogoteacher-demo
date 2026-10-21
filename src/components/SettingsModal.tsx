import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Palette, User, Check, Shield, Clock, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { NotificationSettings } from './NotificationSettings';
import { db } from '../lib/firebase';
import { doc, updateDoc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { UserProfile } from '../types';

interface SettingsModalProps {
  onClose: () => void;
  currentTheme: string;
  onThemeChange: (theme: string) => void;
  onEditProfile: () => void;
  currentUser?: any;
  userProfile?: UserProfile | null;
  onUpdateProfile?: (profile: UserProfile) => Promise<void>;
}

const THEMES = [
  { id: 'teal', name: 'パステルグリーン', bg: '#ccfbf1', border: '#14b8a6' },
  { id: 'pink', name: 'パステルピンク', bg: '#fce7f3', border: '#ec4899' },
  { id: 'blue', name: 'パステルブルー', bg: '#e0f2fe', border: '#0ea5e9' },
  { id: 'purple', name: 'パステルパープル', bg: '#f3e8ff', border: '#a855f7' },
];

const PRESET_TIMES = [
  { label: '朝 7:00', time: '07:00' },
  { label: '昼 12:30', time: '12:30' },
  { label: '夕 18:00', time: '18:00' },
  { label: '夜 20:00', time: '20:00' },
  { label: '夜 21:30', time: '21:30' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
  onClose, 
  currentTheme, 
  onThemeChange, 
  onEditProfile, 
  currentUser,
  userProfile,
  onUpdateProfile
}) => {
  const [privacy, setPrivacy] = useState({
    ranking: true,
    shareProgress: true,
    shareActivity: true,
    notifications: true
  });
  
  // dailyReminderTime state
  const [dailyReminderTime, setDailyReminderTime] = useState<string>(() => {
    return userProfile?.dailyReminderTime || '20:00';
  });
  const [isSavingTime, setIsSavingTime] = useState(false);
  const [timeSaveStatus, setTimeSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [isSavingPrivacy, setIsSavingPrivacy] = useState(false);

  useEffect(() => {
    if (userProfile?.dailyReminderTime) {
      setDailyReminderTime(userProfile.dailyReminderTime);
    }
  }, [userProfile?.dailyReminderTime]);

  // Load latest settings and dailyReminderTime from Firestore / LocalStorage
  useEffect(() => {
    const uid = currentUser?.uid;
    if (uid && db) {
      const fetchUserData = async () => {
        try {
          // 1. Fetch from user root document
          const userDocSnap = await getDoc(doc(db, 'users', uid));
          if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            if (data.privacySettings) {
              setPrivacy(prev => ({ ...prev, ...data.privacySettings }));
            }
            if (data.dailyReminderTime) {
              setDailyReminderTime(data.dailyReminderTime);
            } else if (data.notificationTime) {
              setDailyReminderTime(data.notificationTime);
            } else if (data.notificationPreferences?.reminderTime) {
              setDailyReminderTime(data.notificationPreferences.reminderTime);
            }
          }

          // 2. Also check profile subcollection if needed
          const profileDocSnap = await getDoc(doc(db, `users/${uid}/status`, 'profile'));
          if (profileDocSnap.exists()) {
            const pData = profileDocSnap.data();
            if (pData.dailyReminderTime) {
              setDailyReminderTime(pData.dailyReminderTime);
            }
          }
        } catch (err) {
          console.error("Failed to load user settings in SettingsModal:", err);
        }
      };
      fetchUserData();
    } else {
      // Local fallback
      try {
        const cached = localStorage.getItem('user_notification_preferences');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.reminderTime) setDailyReminderTime(parsed.reminderTime);
        }
      } catch (e) {}
    }
  }, [currentUser?.uid]);

  // Save / Update dailyReminderTime handler
  const handleSaveDailyReminderTime = async () => {
    setIsSavingTime(true);
    setTimeSaveStatus(null);
    const uid = currentUser?.uid;

    try {
      // 1. Save to local storage
      if (uid) {
        const localKey = `user_profile_${uid}`;
        const cached = localStorage.getItem(localKey);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            parsed.dailyReminderTime = dailyReminderTime;
            localStorage.setItem(localKey, JSON.stringify(parsed));
          } catch (e) {}
        }
      }

      // Update cached notification preferences
      try {
        const notifPrefKey = 'user_notification_preferences';
        const cachedPrefs = localStorage.getItem(notifPrefKey);
        const prefs = cachedPrefs ? JSON.parse(cachedPrefs) : {};
        prefs.reminderTime = dailyReminderTime;
        prefs.updatedAt = new Date().toISOString();
        localStorage.setItem(notifPrefKey, JSON.stringify(prefs));
      } catch (e) {}

      // 2. Save to Firestore if connected
      if (uid && db) {
        // Save to users/${uid}/status/profile
        const profileDocRef = doc(db, `users/${uid}/status`, 'profile');
        await setDoc(profileDocRef, {
          dailyReminderTime,
          updatedAt: serverTimestamp(),
        }, { merge: true });

        // Save to users/${uid} root doc
        const userDocRef = doc(db, 'users', uid);
        await setDoc(userDocRef, {
          dailyReminderTime,
          notificationTime: dailyReminderTime,
          'notificationPreferences.reminderTime': dailyReminderTime,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }

      // 3. Update React App userProfile state via callback
      if (onUpdateProfile && userProfile) {
        await onUpdateProfile({
          ...userProfile,
          dailyReminderTime,
        });
      }

      setTimeSaveStatus({
        type: 'success',
        message: `通知時間を「${dailyReminderTime}」に更新・保存しました！`,
      });

      // Clear toast message after 4 seconds
      setTimeout(() => {
        setTimeSaveStatus(null);
      }, 4000);
    } catch (error: any) {
      console.error("Failed to save dailyReminderTime:", error);
      setTimeSaveStatus({
        type: 'error',
        message: `保存に失敗しました: ${error.message || '通信環境をご確認ください'}`,
      });
    } finally {
      setIsSavingTime(false);
    }
  };

  const handleTogglePrivacy = async (key: keyof typeof privacy & string) => {
    const newValue = !privacy[key];
    setPrivacy(prev => ({ ...prev, [key]: newValue }));
    
    if (currentUser?.uid && db) {
      setIsSavingPrivacy(true);
      try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          [`privacySettings.${key}`]: newValue
        });
      } catch (err) {
        console.error("Failed to save privacy setting", err);
      }
      setIsSavingPrivacy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative my-auto max-h-[90vh] overflow-y-auto"
      >
        <button 
          id="closeSettingsModalBtn"
          onClick={onClose} 
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:bg-slate-100 cursor-pointer transition-colors"
          title="閉じる"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
          <span>設定</span>
          {userProfile?.diaryName && (
            <span className="text-xs font-bold text-teal-600 bg-teal-50 px-2.5 py-1 rounded-full">
              {userProfile.diaryName} さん
            </span>
          )}
        </h2>

        <div className="space-y-6">
          {/* 1. 学習リマインダー・プッシュ通知設定 */}
          <div>
            <NotificationSettings userId={currentUser?.uid} />
          </div>

          {/* 2. テーマカラー設定 */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <label className="block text-xs font-bold text-slate-700 flex items-center gap-2">
              <Palette className="w-4 h-4 text-teal-600" /> テーマカラー設定
            </label>
            <div className="grid grid-cols-2 gap-3">
              {THEMES.map(theme => (
                <button
                  key={theme.id}
                  onClick={() => onThemeChange(theme.id)}
                  className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 cursor-pointer ${
                    currentTheme === theme.id ? `border-teal-500 bg-slate-50 ring-2 ring-offset-2 ring-slate-200` : 'border-slate-100 hover:border-slate-200'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full border-2" style={{ backgroundColor: theme.bg, borderColor: theme.border }} />
                  <span className="text-[10px] font-bold text-slate-600">{theme.name}</span>
                  {currentTheme === theme.id && <Check className="w-4 h-4 text-teal-500" />}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-500 pt-1">アプリ全体のメインカラーが切り替わります（一部の要素を除く）。</p>
          </div>

          {/* 3. プライバシー設定 */}
          <div className="border-t pt-5 space-y-4">
            <label className="block text-xs font-bold text-slate-700 flex items-center gap-2">
              <Shield className="w-4 h-4 text-teal-600" /> プライバシー設定
            </label>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-700">ランキングに参加する</p>
                  <p className="text-[10px] text-slate-400">フレンドのランキングに表示されます</p>
                </div>
                <button 
                  onClick={() => handleTogglePrivacy('ranking')}
                  disabled={isSavingPrivacy || !currentUser}
                  className={`w-11 h-6 rounded-full relative transition-colors cursor-pointer ${privacy.ranking ? 'bg-teal-500' : 'bg-slate-300'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${privacy.ranking ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-700">活動をフレンドに表示</p>
                  <p className="text-[10px] text-slate-400">「10問達成しました」などを公開します</p>
                </div>
                <button 
                  onClick={() => handleTogglePrivacy('shareActivity')}
                  disabled={isSavingPrivacy || !currentUser}
                  className={`w-11 h-6 rounded-full relative transition-colors cursor-pointer ${privacy.shareActivity ? 'bg-teal-500' : 'bg-slate-300'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${privacy.shareActivity ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
            </div>
          </div>

          {/* 5. プロフィール変更 */}
          <div className="border-t pt-5">
            <button
              onClick={() => {
                onEditProfile();
                onClose();
              }}
              className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 transition-all text-left cursor-pointer border border-slate-200"
            >
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-teal-600" />
                <div>
                  <div className="text-sm font-bold">プロフィール変更</div>
                  <div className="text-[10px] text-slate-400">学年・所属学科・日記ネームの編集</div>
                </div>
              </div>
              <span className="text-xs text-teal-600 font-bold">編集 &gt;</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
