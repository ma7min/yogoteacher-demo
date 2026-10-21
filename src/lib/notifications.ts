import { getToken, onMessage } from 'firebase/messaging';
import { messaging, db } from './firebase';
import { doc, setDoc } from 'firebase/firestore';

export const requestNotificationPermission = async (userId: string): Promise<{token: string | null, error: string | null}> => {
  // Check if browser supports notifications
  if (!('Notification' in window)) {
    return { 
      token: null, 
      error: 'ご利用のブラウザはWebプッシュ通知をサポートしていません。\niPhone(iOS)の場合は、Safariの共有メニューから「ホーム画面に追加」を行い、追加されたアプリアイコンから起動して設定してください。' 
    };
  }

  if (!messaging) {
    return { token: null, error: '通知システムが初期化されていません。' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      console.log('Notification permission granted.');
      
      // Get VAPID key from environment variable
      const vapidKey = (import.meta as any).env?.VITE_FIREBASE_VAPID_KEY || 'BEiGb9hE6D5h5BkO5l42F1j9vyCSD40Ipns0Clra4Fpd5ulqbG0-qOrhN9rIzGssfR7DlEED-S8OUpavsS7YVJI';
      
      let registration;
      try {
        registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        console.log('Service Worker registered successfully:', registration);
      } catch (swError: any) {
        console.error('Service Worker registration failed:', swError);
        return { token: null, error: 'システムファイルの登録に失敗しました: ' + swError.message };
      }

      try {
        const token = await getToken(messaging, { 
          vapidKey,
          serviceWorkerRegistration: registration 
        });
        
        if (token) {
          console.log('FCM Token:', token);
          if (db && userId) {
            // Determine friendly device name
            let deviceType = 'ブラウザ (PC)';
            const ua = navigator.userAgent;
            if (/iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
              deviceType = 'iPad';
            } else if (/iPhone|iPod/.test(ua)) {
              deviceType = 'iPhone';
            } else if (/Android/.test(ua)) {
              deviceType = 'Android スマホ/タブレット';
            } else if (/Windows/.test(ua)) {
              deviceType = 'Windows PC';
            } else if (/Macintosh/.test(ua)) {
              deviceType = 'Mac PC';
            }

            await setDoc(doc(db, 'users', userId, 'tokens', token), {
              token: token,
              deviceType,
              device: navigator.userAgent,
              updatedAt: new Date(),
              createdAt: new Date(),
            }, { merge: true });
          }
          return { token, error: null };
        } else {
          return { token: null, error: 'トークンが取得できませんでした。' };
        }
      } catch (tokenError: any) {
        console.error('Token retrieval failed:', tokenError);
        return { token: null, error: 'トークンの取得に失敗しました: ' + tokenError.message };
      }
    } else {
      console.log('Unable to get permission to notify.');
      return { token: null, error: 'ブラウザ設定で通知が「拒否」されています。ブラウザの設定から許可に変更してください。' };
    }
  } catch (error: any) {
    console.error('An error occurred while retrieving token. ', error);
    return { token: null, error: '通知許可の処理中にエラーが発生しました: ' + error.message };
  }
};

export const onMessageListener = (callback: (payload: any) => void) => {
  if (messaging) {
    return onMessage(messaging, (payload) => {
      callback(payload);
    });
  }
  return null;
};
