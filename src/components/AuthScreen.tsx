import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, AlertCircle } from 'lucide-react';
import { auth, isFirebaseMock, firebaseInitError } from '../lib/firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

interface AuthScreenProps {
  onSuccessDemoLogin: (email: string) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onSuccessDemoLogin }) => {
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(false);



  // Google Sign In via Popup
  const handleGoogleSignIn = async () => {
    if (isFirebaseMock || !auth) {
      if (firebaseInitError) {
        setMessage({ text: `Firebase初期化エラーのためデモモードへ移行します: ${firebaseInitError}`, isError: true });
        setTimeout(() => onSuccessDemoLogin('demo-student@kamakura-u.ac.jp'), 2000);
      } else {
        onSuccessDemoLogin('demo-student@kamakura-u.ac.jp');
      }
      return;
    }

    setIsLoading(true);
    setMessage(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      // login success will be handled by the onAuthStateChanged in App.tsx
    } catch (error: any) {
      console.error("Firebase Login Error Details:", error);
      const code = error?.code || '';
      let errorMsg = `Googleログインに失敗しました。 (${error.message})`;

      if (code === 'auth/unauthorized-domain') {
        errorMsg = "【承認済みドメイン未設定エラー】\nこのアプリのURLが、Firebaseの「承認済みドメイン」に登録されていません。\n\n◆ 解決方法:\n1. Firebase Console (https://console.firebase.google.com/) で「yogo-teacher」プロジェクトを開きます。\n2. 左メニュー「Authentication」 > 「設定 (Settings)」タブ > 「承認済みドメイン (Authorized domains)」を開きます。\n3. 「ドメインの追加」ボタンを押し、以下のドメインを追加してください：\n   ・ais-dev-gn57lmzzgsc3xluuauhcka-545721833563.asia-northeast1.run.app\n   ・ais-pre-gn57lmzzgsc3xluuauhcka-545721833563.asia-northeast1.run.app";
      } else if (code === 'auth/operation-not-allowed') {
        errorMsg = "【ログインプロバイダ未有効エラー】\nFirebaseでGoogleログインが有効になっていません。\n\n◆ 解決方法:\n1. Firebase Console > 「Authentication」 > 「Sign-in method」タブを開きます。\n2. 「新しいプロバイダを追加」から「Google」を選択し、有効スイッチをONにして保存してください。";
      } else if (code === 'auth/popup-blocked') {
        errorMsg = "【ポップアップブロック】\nブラウザによってログイン用ポップアップ画面がブロックされました。ブラウザのアドレスバーの右端などから、ポップアップの許可を設定してください。";
      } else if (code === 'auth/popup-closed-by-user') {
        errorMsg = "ログインポップアップが閉じられました。もう一度「Googleでログイン」ボタンを押してください。";
      } else if (code === 'auth/configuration-not-found') {
        errorMsg = "【設定未検出エラー】\nFirebase Authの設定が見つからないか、APIキーが正しくありません。Firebase ConsoleでWebアプリが正しく作成されているかご確認ください。";
      } else if (error.message && error.message.includes('cross-origin')) {
        errorMsg = "【COOPセキュリティ制限検出】\nブラウザのセキュリティ制限（Cross-Origin-Opener-Policy）により、ポップアップ通信が遮断されました。ポップアップがブロックされています。ブラウザの設定を確認するか、別の環境でお試しください。";
      }

      setMessage({ text: errorMsg, isError: true });
    } finally {
      setIsLoading(false);
    }
  };



  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full mx-auto"
      >
        {/* Visual Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-teal-500 text-white shadow-xl shadow-teal-500/20 mb-4 animate-pulse">
            <Sparkles className="w-8 h-8" />
          </div>
          <h2 className="text-3xl font-extrabold text-teal-800 tracking-tight sm:text-4xl">
            養護教諭 過去問クイズ
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            養護教諭採用試験に特化した過去問演習 ＆ AI学習パートナー
          </p>
        </div>

        {/* Card of Form */}
        <div className="bg-white py-8 px-6 shadow-xl rounded-2xl border border-teal-50/50 sm:px-10">
          <div className="space-y-5">
            {/* Error/Success Feedbacks */}
            {message && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`p-3.5 rounded-xl text-xs font-medium flex items-start gap-2 ${
                  message.isError
                    ? 'bg-rose-50 border border-rose-100 text-rose-700'
                    : 'bg-emerald-50 border border-emerald-100 text-emerald-800'
                }`}
              >
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span className="whitespace-pre-line leading-relaxed">{message.text}</span>
              </motion.div>
            )}



            {/* Action Buttons */}
            <div className="flex flex-col gap-3 pt-2">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-3 py-3.5 px-4 border border-gray-300 rounded-xl shadow-sm text-sm font-bold text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-all cursor-pointer disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Googleでログイン
              </button>



              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-white text-gray-400 font-medium">または</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onSuccessDemoLogin('demo-student@kamakura-u.ac.jp')}
                className="w-full py-3 px-4 border border-dashed border-gray-300 rounded-xl text-xs font-bold text-gray-500 bg-gray-50/50 hover:bg-gray-100/70 transition-all cursor-pointer text-center"
              >
                デモ学生（オフライン保存）として開始
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

