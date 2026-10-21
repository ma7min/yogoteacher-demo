import React, { useState, useEffect } from 'react';
import { Bell, Clock, CheckCircle2, AlertCircle, Save, Smartphone, Volume2, ShieldCheck, Sparkles, Trash2, Laptop, Tablet, RefreshCw } from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { requestNotificationPermission } from '../lib/notifications';

export interface NotificationPreferences {
  enabled: boolean;
  reminderTime: string; // "HH:mm" (例: "20:00")
  dailyReminder: boolean;
  streakReminder: boolean;
  soundEnabled: boolean;
  weekendReminder: boolean;
  updatedAt?: string;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: true,
  reminderTime: '20:00',
  dailyReminder: true,
  streakReminder: true,
  soundEnabled: true,
  weekendReminder: true,
};

interface NotificationSettingsProps {
  userId?: string | null;
  onSaveSuccess?: () => void;
  className?: string;
}

interface RegisteredDevice {
  id: string;
  token: string;
  deviceType?: string;
  device?: string;
  createdAt?: any;
  updatedAt?: any;
}

export const NotificationSettings: React.FC<NotificationSettingsProps> = ({
  userId,
  onSaveSuccess,
  className = '',
}) => {
  const currentUid = userId || auth?.currentUser?.uid || null;

  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>('default');
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // 登録端末リストのステート
  const [devices, setDevices] = useState<RegisteredDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState<boolean>(false);

  // 現在の操作端末の種類を判定
  const getCurrentDeviceType = () => {
    if (typeof navigator === 'undefined') return 'この端末';
    const ua = navigator.userAgent;
    if (/iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'iPad';
    if (/iPhone|iPod/.test(ua)) return 'iPhone';
    if (/Android/.test(ua)) return 'Android スマホ';
    if (/Windows/.test(ua)) return 'Windows PC';
    if (/Macintosh/.test(ua)) return 'Mac PC';
    return 'この端末';
  };

  // Firestoreから登録済み端末一覧を取得
  const loadDevices = async () => {
    if (!currentUid || !db) return;
    setLoadingDevices(true);
    try {
      const snap = await getDocs(collection(db, 'users', currentUid, 'tokens'));
      const list: RegisteredDevice[] = [];
      snap.forEach((d) => {
        const data = d.data();
        let inferredType = data.deviceType;
        if (!inferredType) {
          const ua = data.device || '';
          if (/iPad/.test(ua) || (ua.includes('Macintosh') && ua.includes('Mobile'))) {
            inferredType = 'iPad';
          } else if (/Android/.test(ua)) {
            inferredType = 'Android スマホ';
          } else if (/iPhone/.test(ua)) {
            inferredType = 'iPhone';
          } else if (/Windows/.test(ua)) {
            inferredType = 'Windows PC';
          } else {
            inferredType = 'PC / ブラウザ';
          }
        }
        list.push({
          id: d.id,
          token: data.token || d.id,
          deviceType: inferredType,
          device: data.device,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        });
      });
      setDevices(list);
    } catch (err) {
      console.error('Failed to load devices:', err);
    } finally {
      setLoadingDevices(false);
    }
  };

  // 登録済み端末の削除
  const handleDeleteDevice = async (docId: string) => {
    if (!currentUid || !db) return;
    try {
      await deleteDoc(doc(db, 'users', currentUid, 'tokens', docId));
      setDevices((prev) => prev.filter((d) => d.id !== docId));
      setStatusMessage({ text: '端末の通知登録を解除しました。', type: 'info' });
    } catch (e: any) {
      setStatusMessage({ text: '削除に失敗しました: ' + e.message, type: 'error' });
    }
  };

  // ブラウザの通知パーミッション確認
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermissionState(Notification.permission);
    } else {
      setPermissionState('unsupported');
    }
  }, []);

  // Firestoreからユーザーの通知設定ドキュメントと端末一覧を読み込む
  useEffect(() => {
    let isMounted = true;

    const loadSettings = async () => {
      // 1. ローカルキャッシュから復元
      try {
        const cached = localStorage.getItem('user_notification_preferences');
        if (cached && isMounted) {
          setPreferences({ ...DEFAULT_PREFERENCES, ...JSON.parse(cached) });
        }
      } catch (e) {
        console.warn('Failed to parse cached notification settings:', e);
      }

      // 2. Firestoreから最新設定を取得
      if (currentUid && db) {
        try {
          const userDocRef = doc(db, 'users', currentUid);
          const snap = await getDoc(userDocRef);
          if (snap.exists() && isMounted) {
            const data = snap.data();
            const loadedPrefs: NotificationPreferences = {
              ...DEFAULT_PREFERENCES,
              ...(data.notificationPreferences || data.notificationSettings || {}),
            };
            setPreferences(loadedPrefs);
            localStorage.setItem('user_notification_preferences', JSON.stringify(loadedPrefs));
          }
        } catch (error) {
          console.error('Error fetching notification preferences from Firestore:', error);
        }

        // 端末リストも取得
        if (isMounted) {
          await loadDevices();
        }
      }

      if (isMounted) setLoading(false);
    };

    loadSettings();

    return () => {
      isMounted = false;
    };
  }, [currentUid]);

  // Firestoreに設定を保存するハンドラー
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setStatusMessage(null);

    try {
      const updatedPrefs: NotificationPreferences = {
        ...preferences,
        updatedAt: new Date().toISOString(),
      };

      // ローカルストレージに即時保存
      localStorage.setItem('user_notification_preferences', JSON.stringify(updatedPrefs));

      // Firestoreに保存
      if (currentUid && db) {
        const userDocRef = doc(db, 'users', currentUid);
        await setDoc(
          userDocRef,
          {
            dailyReminderTime: preferences.reminderTime,
            notificationTime: preferences.reminderTime,
            notificationPreferences: updatedPrefs,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );

        // プロファイルサブコレクションにも同期
        try {
          const profileDocRef = doc(db, `users/${currentUid}/status`, 'profile');
          await setDoc(profileDocRef, {
            dailyReminderTime: preferences.reminderTime,
          }, { merge: true });
        } catch (profileErr) {
          console.warn("Could not sync reminder time to profile subcollection:", profileErr);
        }

        // ローカルプロファイルキャッシュも更新
        try {
          const cachedProfile = localStorage.getItem(`user_profile_${currentUid}`);
          if (cachedProfile) {
            const parsed = JSON.parse(cachedProfile);
            parsed.dailyReminderTime = preferences.reminderTime;
            localStorage.setItem(`user_profile_${currentUid}`, JSON.stringify(parsed));
          }
        } catch (e) {}
      }

      // バックエンドAPIにも同期送信（存在する場合）
      try {
        await fetch('/api/fcm/save-preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: currentUid,
            preferences: updatedPrefs,
          }),
        });
      } catch {
        // オフラインまたはAPI未対応環境でもFirestore直接保存で動作可能
      }

      setStatusMessage({
        text: `通知時間を「${preferences.reminderTime}」に設定・保存しました。`,
        type: 'success',
      });

      if (onSaveSuccess) {
        onSaveSuccess();
      }
    } catch (error: any) {
      console.error('Error saving notification preferences:', error);
      setStatusMessage({
        text: `保存中にエラーが発生しました: ${error.message || '通信環境をご確認ください'}`,
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  // 通知許可のリクエスト・トークン取得
  const handleRequestPermission = async () => {
    if (!currentUid) {
      setStatusMessage({
        text: '通知を受け取るにはログインが必要です。',
        type: 'error',
      });
      return;
    }

    setStatusMessage({ text: '端末の通知許可を処理中...', type: 'info' });
    const result = await requestNotificationPermission(currentUid);

    if (result.error) {
      setStatusMessage({ text: result.error, type: 'error' });
    } else {
      setPermissionState('granted');
      await loadDevices();
      setStatusMessage({
        text: `🎉 ${getCurrentDeviceType()}の通知登録が完了しました！この端末でプッシュ通知を受け取れます。`,
        type: 'success',
      });
    }
  };

  // 即時テスト通知送信ハンドラー
  const [testingNotification, setTestingNotification] = useState<boolean>(false);
  const handleSendTestNotification = async () => {
    if (!currentUid) {
      setStatusMessage({ text: 'ログインが必要です。', type: 'error' });
      return;
    }

    setTestingNotification(true);
    setStatusMessage({ text: '📲 サーバー経由でテスト通知を送信中...', type: 'info' });

    try {
      // まず現在の設定を確実に保存
      await handleSave();

      const response = await fetch(`/api/fcm/cron-reminders?userId=${currentUid}&time=${preferences.reminderTime}`);
      const data = await response.json();

      if (data.status === 'ok' && data.successCount > 0) {
        setStatusMessage({
          text: `🎉 スマホへテスト通知を正常に送信しました！（送信成功: ${data.successCount}台）\nお手元のスマホ画面をご確認ください。`,
          type: 'success',
        });
      } else if (data.message) {
        setStatusMessage({
          text: `通知処理結果: ${data.message}\n(※端末がまだ通知を許可していないか、トークンが登録されていない可能性があります)`,
          type: 'error',
        });
      } else {
        setStatusMessage({
          text: '通知送信リクエストは完了しましたが、端末への配信状況を確認してください。',
          type: 'info',
        });
      }
    } catch (err: any) {
      setStatusMessage({
        text: `テスト送信エラー: ${err.message || 'サーバーとの通信に失敗しました'}`,
        type: 'error',
      });
    } finally {
      setTestingNotification(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-slate-400 text-sm animate-pulse">
        通知設定を読み込み中...
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm ${className}`}>
      {/* ヘッダー部分 */}
      <div className="flex items-center gap-3 pb-4 mb-5 border-b border-slate-100">
        <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
          <Bell className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
            学習リマインダー通知設定
          </h2>
          <p className="text-xs text-slate-500">
            ご自身の生活リズムに合わせて、毎日の過去問演習リマインド時刻を設定できます。
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* タイムピッカー（<input type="time">）設定カード */}
        <div className="bg-gradient-to-br from-teal-50/70 to-emerald-50/50 border-2 border-teal-200/80 rounded-2xl p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <label htmlFor="reminderTimeInput" className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-teal-600" />
                通知を受け取る希望時刻
              </label>
              <p className="text-[11px] text-teal-700/80">
                指定した時刻にスマホやブラウザにリマインダー通知を送信します（日本時間 JST）。
              </p>
            </div>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-teal-100 text-teal-800 shrink-0">
              1分単位で設定可能
            </span>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
            {/* HTML time input picker */}
            <div className="relative flex-1">
              <input
                id="reminderTimeInput"
                type="time"
                value={preferences.reminderTime || '20:00'}
                onChange={(e) =>
                  setPreferences((prev) => ({
                    ...prev,
                    reminderTime: e.target.value,
                  }))
                }
                className="w-full text-xl sm:text-2xl font-mono font-bold text-slate-800 bg-white border-2 border-teal-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-4 focus:ring-teal-200 focus:border-teal-500 shadow-sm transition-all"
                required
              />
            </div>

            {/* クイック選択ショートカット */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {[
                { label: '朝 7:00', time: '07:00' },
                { label: '昼 12:30', time: '12:30' },
                { label: '夜 20:00', time: '20:00' },
                { label: '夜 21:30', time: '21:30' },
              ].map((slot) => (
                <button
                  key={slot.time}
                  type="button"
                  onClick={() =>
                    setPreferences((prev) => ({
                      ...prev,
                      reminderTime: slot.time,
                    }))
                  }
                  className={`text-xs px-2.5 py-2 rounded-lg font-bold transition-all shrink-0 cursor-pointer ${
                    preferences.reminderTime === slot.time
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'bg-white/80 text-teal-800 hover:bg-white border border-teal-200'
                  }`}
                >
                  {slot.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 詳細オプション */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            通知の詳細オプション
          </h3>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-slate-50/50 overflow-hidden">
            {/* 毎日のリマインダーON/OFF */}
            <label className="p-3.5 flex items-center justify-between hover:bg-white transition-colors cursor-pointer">
              <div className="space-y-0.5">
                <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-teal-500" />
                  毎日の学習リマインダー
                </span>
                <p className="text-xs text-slate-500">
                  指定時刻にその日の過去問演習をお知らせします
                </p>
              </div>
              <input
                type="checkbox"
                checked={preferences.dailyReminder}
                onChange={(e) =>
                  setPreferences((prev) => ({
                    ...prev,
                    dailyReminder: e.target.checked,
                  }))
                }
                className="w-5 h-5 text-teal-600 rounded border-slate-300 focus:ring-teal-500 cursor-pointer"
              />
            </label>

            {/* 連続学習（ストリーク）アラート */}
            <label className="p-3.5 flex items-center justify-between hover:bg-white transition-colors cursor-pointer">
              <div className="space-y-0.5">
                <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-500" />
                  ストリーク途切れ防止アラート
                </span>
                <p className="text-xs text-slate-500">
                  連続学習記録が途切れそうな日に事前にお知らせします
                </p>
              </div>
              <input
                type="checkbox"
                checked={preferences.streakReminder}
                onChange={(e) =>
                  setPreferences((prev) => ({
                    ...prev,
                    streakReminder: e.target.checked,
                  }))
                }
                className="w-5 h-5 text-teal-600 rounded border-slate-300 focus:ring-teal-500 cursor-pointer"
              />
            </label>

            {/* サウンド・バイブレーション */}
            <label className="p-3.5 flex items-center justify-between hover:bg-white transition-colors cursor-pointer">
              <div className="space-y-0.5">
                <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-blue-500" />
                  通知音・バイブレーション
                </span>
                <p className="text-xs text-slate-500">
                  通知受信時のサウンド効果またはバイブレーションを有効にします
                </p>
              </div>
              <input
                type="checkbox"
                checked={preferences.soundEnabled}
                onChange={(e) =>
                  setPreferences((prev) => ({
                    ...prev,
                    soundEnabled: e.target.checked,
                  }))
                }
                className="w-5 h-5 text-teal-600 rounded border-slate-300 focus:ring-teal-500 cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* 受信端末の管理（スマホ・iPad・PC） */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-teal-600" />
              <h3 className="text-xs font-bold text-slate-800">
                通知を受信する端末の管理 ({devices.length} 台登録中)
              </h3>
            </div>
            <button
              type="button"
              onClick={loadDevices}
              className="text-[11px] text-slate-500 hover:text-teal-600 flex items-center gap-1 cursor-pointer"
              title="端末一覧を更新"
            >
              <RefreshCw className={`w-3 h-3 ${loadingDevices ? 'animate-spin' : ''}`} />
              更新
            </button>
          </div>

          <p className="text-[11px] text-slate-600 leading-relaxed">
            スマホやiPadで通知を受け取るには、それぞれの端末（ホーム画面のアイコンやChrome）で本アプリを開き、下の<strong>「この端末を通知に登録する」</strong>ボタンをタップしてください。
          </p>

          {/* 現在操作中の端末の登録アクション */}
          <div className="bg-white border border-teal-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <span className={`w-2.5 h-2.5 rounded-full ${permissionState === 'granted' ? 'bg-emerald-500' : 'bg-amber-500'} animate-pulse`} />
              <div>
                <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  現在の端末: <span className="text-teal-700 font-extrabold">{getCurrentDeviceType()}</span>
                </p>
                <p className="text-[11px] text-slate-500">
                  {permissionState === 'granted'
                    ? 'ブラウザの通知権限: 許可済み'
                    : permissionState === 'denied'
                    ? '⚠️ ブラウザ側で通知がブロックされています'
                    : '端末での通知許可が必要です'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRequestPermission}
              className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-xs transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              <Smartphone className="w-3.5 h-3.5" />
              この{getCurrentDeviceType()}を通知に登録・更新
            </button>
          </div>

          {/* 登録済み端末一覧 */}
          {devices.length > 0 ? (
            <div className="space-y-1.5 pt-1">
              <p className="text-[11px] font-bold text-slate-600">現在登録されている端末（通知が届く端末）:</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {devices.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-xl text-xs"
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      {d.deviceType?.includes('iPad') ? (
                        <Tablet className="w-4 h-4 text-purple-600 shrink-0" />
                      ) : d.deviceType?.includes('Android') || d.deviceType?.includes('iPhone') ? (
                        <Smartphone className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <Laptop className="w-4 h-4 text-blue-600 shrink-0" />
                      )}
                      <div className="truncate">
                        <p className="font-bold text-slate-800 truncate">
                          {d.deviceType || '登録端末'}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          トークン: {d.id.slice(0, 16)}...
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteDevice(d.id)}
                      className="px-2 py-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center gap-1 text-[11px]"
                      title="この端末への通知を解除"
                    >
                      <Trash2 className="w-3 h-3" />
                      解除
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-500">
                ※PCへの通知が不要な場合は、一覧の「Windows PC」の「解除」ボタンを押すとPCへの通知を停止できます。
              </p>
            </div>
          ) : (
            <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
              まだ登録されている端末がありません。上のボタンを押して登録してください。
            </p>
          )}
        </div>

        {/* ステータス・完了メッセージ */}
        {statusMessage && (
          <div
            className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 ${
              statusMessage.type === 'success'
                ? 'bg-teal-50 text-teal-800 border border-teal-200'
                : statusMessage.type === 'error'
                ? 'bg-rose-50 text-rose-800 border border-rose-200'
                : 'bg-blue-50 text-blue-800 border border-blue-200'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="leading-relaxed whitespace-pre-wrap">{statusMessage.text}</div>
          </div>
        )}

        {/* アクションボタン（テスト送信＆保存） */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={handleSendTestNotification}
            disabled={testingNotification || saving}
            className="px-4 py-2.5 bg-amber-50 hover:bg-amber-100 active:bg-amber-200 text-amber-900 border border-amber-300 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Bell className="w-3.5 h-3.5 text-amber-600 animate-bounce" />
            {testingNotification ? 'テスト通知を送信中...' : '今すぐスマホへテスト通知を送る'}
          </button>

          <button
            type="submit"
            disabled={saving || testingNotification}
            className="w-full sm:w-auto px-6 py-2.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-sm rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? '保存しています...' : '通知時刻・設定を保存する'}
          </button>
        </div>
      </form>
    </div>
  );
};
