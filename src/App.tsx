import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Menu, Sparkles, GraduationCap, RefreshCw, Star, Info, AlertCircle, Shield, Home, BookOpen, BarChart3, ClipboardList, Users } from 'lucide-react';
import { auth, isFirebaseMock, db, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, writeBatch, collection, getDocs, serverTimestamp, addDoc, query, where } from 'firebase/firestore';
import { addLearningPoints, checkAndUpdateStreak, recalculateAndSyncAllTimePoints } from './lib/points';

// Types and data
import { Question, MainMode, UserProfile } from './types';
import { initialQuestions } from './data/questions';

// Core Components
import { AuthScreen } from './components/AuthScreen';
import { Dashboard } from './components/Dashboard';
import { SelectionScreen } from './components/SelectionScreen';
import { QuizPlayArea } from './components/QuizPlayArea';
import { NotificationDropdown } from './components/NotificationDropdown';
import { SideMenu } from './components/SideMenu';
import { AdminDashboard } from './components/AdminDashboard';
import { ReportScreen } from './components/ReportScreen';
import PdfMaker from './components/PdfMaker';
import { ProfileSetupModal } from './components/ProfileSetupModal';
import { SettingsModal } from './components/SettingsModal';
import { FriendsScreen } from './components/FriendsScreen';

export default function App() {
  // Authentication states
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [demoUserEmail, setDemoUserEmail] = useState<string | null>('demo-student@kamakura-u.ac.jp');
  const [authLoading, setAuthLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('app_theme') || 'teal');

  // Synchronize active theme to document root element
  useEffect(() => {
    document.documentElement.classList.remove('theme-teal', 'theme-pink', 'theme-blue', 'theme-purple');
    document.documentElement.classList.add(`theme-${theme}`);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // App navigation / screens
  // 'dash' = Dashboard, 'selection' = Setup mode tabs, 'play' = In actual Quiz, 'admin' = Thesis Admin Dashboard, 'report' = All questions archive
  const [currentScreen, setCurrentScreen] = useState<'dash' | 'selection' | 'play' | 'admin' | 'report' | 'pdf-maker' | 'friends'>('dash');
  const [dashTab, setDashTab] = useState<'home' | 'study' | 'analysis'>('home');
  const [selectedWebMode, setSelectedWebMode] = useState<MainMode>('past');

  // Multi questions data state
  const [questions, setQuestions] = useState<Question[]>(() => {
    try {
      const savedAi = localStorage.getItem('ai_archived_questions');
      if (savedAi) {
        const parsed = JSON.parse(savedAi);
        return [...initialQuestions, ...parsed];
      }
    } catch(e) {}
    return initialQuestions;
  });
  const [quizFilteredQuestions, setQuizFilteredQuestions] = useState<Question[]>([]);
  const [answerHistory, setAnswerHistory] = useState<Record<string | number, boolean>>({});
  const [attemptsHistory, setAttemptsHistory] = useState<Record<string | number, boolean[]>>({});
  const [answerTimestamps, setAnswerTimestamps] = useState<Record<string | number, number>>({});
  const [bookmarks, setBookmarks] = useState<Set<string | number>>(() => {
    try {
      const saved = localStorage.getItem('bookmarks');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [todayStats, setTodayStats] = useState({ attempted: 0, correct: 0 });
  const [firebaseError, setFirebaseError] = useState<string | null>(null);

  const [savedQuizState, setSavedQuizState] = useState<{
    filteredQuestions: Question[];
    currentIndex: number;
    correctCount: number;
    sessionHistory: Record<string | number, boolean>;
    mode: MainMode;
  } | null>(() => {
    try {
      const saved = localStorage.getItem('saved_quiz_state');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // UI status (notifs, sidebar draw)
  const [notifOpen, setNotifOpen] = useState(false);
  
  // Foreground push notification listener
  useEffect(() => {
    let unsubscribe: any;
    const setupNotifications = async () => {
      try {
        const { onMessageListener } = await import('./lib/notifications');
        unsubscribe = onMessageListener((payload: any) => {
          console.log('Received foreground message:', payload);
          alert(`${payload.notification?.title || '通知'}\n\n${payload.notification?.body || ''}`);
        });
      } catch (err) {
        console.warn('Notification listener setup failed', err);
      }
    };
    setupNotifications();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);
  
  // 画面遷移時にスムーズに上部へスクロール
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentScreen, selectedWebMode]);
  
  // Latest notification ID to track read state
  const LATEST_NOTIF_ID = 3;
  const [hasUnreadNotif, setHasUnreadNotif] = useState(() => {
    try {
      const lastRead = localStorage.getItem('last_read_notif_id');
      return !lastRead || parseInt(lastRead, 10) < LATEST_NOTIF_ID;
    } catch (e) {
      return true;
    }
  });
  const [menuOpen, setMenuOpen] = useState(false);

  // AI advisory & AI expected questions parameters
  const [adviceText, setAdviceText] = useState<string | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [aiQuizLoading, setAiQuizLoading] = useState(false);

  // Email of verified logged-in user
  const effectiveEmail = currentUser?.email || demoUserEmail;

  // 日本時間(JST)で一貫した YYYY-MM-DD 日付文字列を取得するヘルパー (ブラウザ/ホストによる表記揺れ・不一致によるリセットを完全に防ぐ)
  const getTodayJSTString = () => {
    const now = new Date();
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstTime = new Date(now.getTime() + jstOffset + (now.getTimezoneOffset() * 60 * 1000));
    const y = jstTime.getFullYear();
    const m = String(jstTime.getMonth() + 1).padStart(2, '0');
    const d = String(jstTime.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // 今日の達成度のロードと日付比較リセット (マルチデバイス/ログイン時同期可能なFirestoreハイブリッド対応)
  const loadTodayStats = async (userIdStr: string) => {
    try {
      const todayString = getTodayJSTString();
      const key = `today_stats_${userIdStr}`;
      
      // 1. まずオフライン/高速ロード用にLocalStorageから読み込み
      const saved = localStorage.getItem(key);
      let localFound = false;
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.date === todayString) {
          setTodayStats({ attempted: parsed.attempted || 0, correct: parsed.correct || 0 });
          localFound = true;
        }
      }

      // 2. 正規のFirebaseアカウント接続中で、ゲスト以外のログイン時
      if (!isFirebaseMock && db && auth?.currentUser && userIdStr !== 'guest') {
        const todayDocRef = doc(db, `users/${userIdStr}/status`, 'today');
        const todaySnap = await getDoc(todayDocRef);
        
        if (todaySnap.exists()) {
          const data = todaySnap.data();
          if (data.date === todayString) {
            const remoteStats = { attempted: data.attempted || 0, correct: data.correct || 0 };
            setTodayStats(remoteStats);
            localStorage.setItem(key, JSON.stringify({ date: todayString, ...remoteStats }));
            console.log("Firestore: 今日の達成度データをサーバーから正常に同期ロードしました。", remoteStats);
            return;
          }
        }
        
        // サーバーにデータがない、または日付が昨日以前のものである場合は本日分を初期化(今日初ログイン時)
        const initial = { date: todayString, attempted: 0, correct: 0, lastUpdated: serverTimestamp() };
        await setDoc(todayDocRef, initial, { merge: true });
        setTodayStats({ attempted: 0, correct: 0 });
        localStorage.setItem(key, JSON.stringify({ date: todayString, attempted: 0, correct: 0 }));
        console.log("Firestore: 新しい一日が開始されたため、今日の進捗を初期化同期しました。");
        return;
      }

      // ゲストやMockの場合の標準ローカルフォールバック
      if (!localFound) {
        const initial = { attempted: 0, correct: 0 };
        setTodayStats(initial);
        localStorage.setItem(key, JSON.stringify({ date: todayString, ...initial }));
      }
    } catch (e) {
      console.error("Failed to load today's stats:", e);
    }
  };

  // 今日の達成度の保存 (高速ローカル保存 ＆ Firestoreリアルタイム反映のハイブリッド対応)
  const saveTodayStats = async (userIdStr: string, attemptedVal: number, correctVal: number) => {
    try {
      const todayString = getTodayJSTString();
      const key = `today_stats_${userIdStr}`;
      
      // 1. ローカルキャッシュの更新
      localStorage.setItem(key, JSON.stringify({
        date: todayString,
        attempted: attemptedVal,
        correct: correctVal
      }));

      // 2. ログイン中の場合はFirestoreのデータベースへ即時プッシュ
      if (!isFirebaseMock && db && auth?.currentUser && userIdStr !== 'guest') {
        const todayDocRef = doc(db, `users/${userIdStr}/status`, 'today');
        await setDoc(todayDocRef, {
          date: todayString,
          attempted: attemptedVal,
          correct: correctVal,
          lastUpdated: serverTimestamp()
        }, { merge: true });
        console.log("Firestore: 今日の達成度をクラウドへ同期完了しました:", { attemptedVal, correctVal });
      }
    } catch (e) {
      console.error("Failed to save today's stats:", e);
    }
  };

  // プロフィール情報の取得・設定トリガー (学年・学科・日記ネームのファーストログイン確認)
  const loadUserProfile = async (userId: string) => {
    // 1. ローカルキャッシュから優先ロード
    const localKey = `user_profile_${userId}`;
    const saved = localStorage.getItem(localKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.grade && parsed.department && parsed.diaryName) {
          const profile: UserProfile = {
            grade: parsed.grade,
            department: parsed.department,
            diaryName: parsed.diaryName,
            dailyReminderTime: parsed.dailyReminderTime || '20:00'
          };
          setUserProfile(profile);
          setShowProfileSetup(false);
          return;
        }
      } catch (e) {
        console.error("Failed to parse local profile", e);
      }
    }

    // 2. クラウドに接続している場合はFirestoreを検索
    if (!isFirebaseMock && db && auth?.currentUser && userId !== 'guest') {
      try {
        const profileRef = doc(db, `users/${userId}/status`, 'profile');
        const snap = await getDoc(profileRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data.examTarget && data.examTarget.prefecture && data.examTarget.date) {
            localStorage.setItem('exam_target_info', JSON.stringify(data.examTarget));
            localStorage.setItem(`exam_target_info_${userId}`, JSON.stringify(data.examTarget));
          }
          if (data.grade && data.department && data.diaryName) {
            const profile: UserProfile = {
              grade: data.grade,
              department: data.department,
              diaryName: data.diaryName,
              dailyReminderTime: data.dailyReminderTime || '20:00'
            };
            setUserProfile(profile);
            localStorage.setItem(localKey, JSON.stringify(profile));
            setShowProfileSetup(false);

            // ルートの users/{userId} ドキュメントにも grade と department を自動同期（ランキング・類型表示用）
            setDoc(doc(db, 'users', userId), {
              diaryName: profile.diaryName,
              grade: profile.grade,
              department: profile.department,
              dailyReminderTime: profile.dailyReminderTime,
            }, { merge: true }).catch(err => console.warn("Failed to sync profile to user root:", err));

            return;
          }
        }
      } catch (error) {
        console.error("Failed to fetch user profile from Firestore:", error);
      }

      try {
        const userDocSnap = await getDoc(doc(db, 'users', userId));
        if (userDocSnap.exists()) {
          const uData = userDocSnap.data();
          if (uData?.theme) {
            const remoteTheme = uData.theme;
            setTheme(remoteTheme);
            localStorage.setItem('app_theme', remoteTheme);
          }
          if (uData?.examTarget && uData.examTarget.prefecture && uData.examTarget.date) {
            localStorage.setItem('exam_target_info', JSON.stringify(uData.examTarget));
            localStorage.setItem(`exam_target_info_${userId}`, JSON.stringify(uData.examTarget));
          }
        }
      } catch (e) {
        // ignore if not set
      }
    }

    // 3. 文化祭展示版: プロフィール設定モーダルは表示せずデフォルト値を自動設定
    const defaultProfile: UserProfile = {
      grade: '大学院生',
      department: '文化祭ゲスト',
      diaryName: 'ゲスト',
      dailyReminderTime: '20:00'
    };
    localStorage.setItem(localKey, JSON.stringify(defaultProfile));
    setUserProfile(defaultProfile);
    setShowProfileSetup(false);
  };

  const handleThemeChange = async (newTheme: string) => {
    setTheme(newTheme);
    localStorage.setItem('app_theme', newTheme);
    if (!isFirebaseMock && db && auth?.currentUser) {
      try {
        await updateDoc(doc(db, 'users', auth.currentUser.uid), {
          theme: newTheme
        });
      } catch (err) {
        console.warn("Could not save theme to user document:", err);
      }
    }
  };

  const handleSaveProfile = async (profileData: UserProfile) => {
    const activeUserId = auth?.currentUser?.uid || demoUserEmail || 'guest';
    if (activeUserId === 'guest') return;

    try {
      const fullProfile: UserProfile = {
        ...profileData,
        dailyReminderTime: profileData.dailyReminderTime || '20:00'
      };

      // 1. ローカルに即座にキャッシュ保存
      const localKey = `user_profile_${activeUserId}`;
      localStorage.setItem(localKey, JSON.stringify(fullProfile));

      // 2. Firebaseに保存 (ログインユーザーのみ)
      if (!isFirebaseMock && db && auth?.currentUser) {
        const profileRef = doc(db, `users/${activeUserId}/status`, 'profile');
        await setDoc(profileRef, {
          grade: fullProfile.grade,
          department: fullProfile.department,
          diaryName: fullProfile.diaryName,
          dailyReminderTime: fullProfile.dailyReminderTime,
          email: currentUser?.email || demoUserEmail,
          updatedAt: serverTimestamp()
        }, { merge: true });

        // フレンド＆ランキング機能および通知用プロパティをユーザールートドキュメントにも保存する
        const userRootRef = doc(db, 'users', activeUserId);
        await setDoc(userRootRef, {
          diaryName: fullProfile.diaryName,
          grade: fullProfile.grade,
          department: fullProfile.department,
          dailyReminderTime: fullProfile.dailyReminderTime,
          notificationTime: fullProfile.dailyReminderTime,
          'notificationPreferences.reminderTime': fullProfile.dailyReminderTime,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        console.log("Firestore: Profile saved successfully.");
      }

      setUserProfile(fullProfile);
      setShowProfileSetup(false);
    } catch (error) {
      console.error("Failed to save user profile:", error);
      alert("プロフィールの保存に失敗しました。");
    }
  };

  // Track Firebase Authenticaticon
  useEffect(() => {
    if (isFirebaseMock || !auth) {
      setAuthLoading(false);
      // 文化祭展示版: ログイン不要 — デモメールで自動スタート
      const demoEmail = 'demo-student@kamakura-u.ac.jp';
      setDemoUserEmail(demoEmail);
      loadLocalHistory(demoEmail);
      loadTodayStats(demoEmail);
      loadUserProfile(demoEmail);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);

      if (user) {
        loadUserHistoryFromFirestore(user.uid);
        loadTodayStats(user.uid);
        loadUserProfile(user.uid);
      } else {
        // 文化祭展示版: ログイン不要 — デモメールで自動スタート
        const demoEmail = 'demo-student@kamakura-u.ac.jp';
        setDemoUserEmail(demoEmail);
        loadLocalHistory(demoEmail);
        loadTodayStats(demoEmail);
        loadUserProfile(demoEmail);
      }
    });

    return () => unsubscribe();
  }, []);

  // Fetch or Load history from secure Firestore
  // Local Storage fallback loading
  const loadLocalHistory = (userIdStr: string) => {
    try {
      const saved = localStorage.getItem(`local_answers_history_${userIdStr}`);
      if (saved) {
        setAnswerHistory(JSON.parse(saved));
      }
      const savedAttempts = localStorage.getItem(`local_attempts_history_${userIdStr}`);
      if (savedAttempts) {
        setAttemptsHistory(JSON.parse(savedAttempts));
      }
      const savedTimestamps = localStorage.getItem(`local_answer_timestamps_${userIdStr}`);
      if (savedTimestamps) {
        setAnswerTimestamps(JSON.parse(savedTimestamps));
      }
    } catch (e) {
      console.error("Local storage read error", e);
    }
  };

  const handleToggleBookmark = (id: string | number) => {
    setBookmarks(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      try { localStorage.setItem('bookmarks', JSON.stringify([...next])); } catch (e) {}
      return next;
    });
  };

  // Auth screen actions
  const handleSuccessDemoLogin = (email: string) => {
    setDemoUserEmail(email);
    localStorage.setItem('demo_user_email', email);
    loadLocalHistory(email);
    loadTodayStats(email);
    loadUserProfile(email);
  };

  const handleSignOut = async () => {
    // Identify user to clear local storage before clearing auth state
    const userIdToClear = currentUser?.uid || demoUserEmail;

    if (!isFirebaseMock && auth) {
      await signOut(auth);
    }
    setDemoUserEmail(null);
    localStorage.removeItem('demo_user_email');
    
    if (userIdToClear) {
      localStorage.removeItem(`local_answers_history_${userIdToClear}`);
      localStorage.removeItem(`local_attempts_history_${userIdToClear}`);
      localStorage.removeItem(`today_stats_${userIdToClear}`);
      localStorage.removeItem(`exam_target_info_${userIdToClear}`);
    }
    localStorage.removeItem('exam_target_info');

    setAnswerHistory({});
    setAttemptsHistory({});
    setTodayStats({ attempted: 0, correct: 0 });
    setCurrentScreen('dash');
  };

  // Menu Mode trigger
  const handleModeChange = (mode: MainMode) => {
    setSelectedWebMode(mode);
    if (mode === 'admin') {
      setCurrentScreen('admin');
    } else if (mode === 'report') {
      setCurrentScreen('report');
    } else if (mode === 'pdf-maker') {
      // 文化祭展示版: PDF読み込み機能はセキュリティ上の理由で無効化
      alert('この機能は文化祭展示中はご利用いただけません。\n(ネットワークのセキュリティ上の理由により、PDFアップロード機能を一時停止しています)');
    } else {
      setCurrentScreen('selection');
    }
  };

  const handleShowDashboard = () => {
    setCurrentScreen('dash');
    setDashTab('home');
  };

  const handleTabChange = (tab: 'home' | 'study' | 'analysis' | 'report' | 'friends') => {
    if (tab === 'report') {
      setCurrentScreen('report');
    } else if (tab === 'friends') {
      setCurrentScreen('friends');
    } else {
      setCurrentScreen('dash');
      setDashTab(tab);
    }
  };

  const shuffleWithGrouping = (questionsToShuffle: Question[]) => {
    const groups = new Map<string, Question[]>();
    questionsToShuffle.forEach(q => {
      let key = q.id.toString();
      const match = q.question.match(/^(.*?)(?:について，空欄|について、空欄|について\s*空欄|の空欄)/);
      if (match && match[1]) {
        key = match[1];
      }
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(q);
    });

    const groupArray = Array.from(groups.values());
    const shuffledGroups = groupArray.sort(() => Math.random() - 0.5);
    return shuffledGroups.flat();
  };

  const handleStartRandom = (count: number) => {
    // 1. 未解答の問題を抽出
    const unattempted = questions.filter(q => answerHistory[q.id] === undefined);
    
    // 2. 不正解の問題を抽出
    const incorrect = questions.filter(q => answerHistory[q.id] === false);
    
    let pool: Question[] = [];
    if (unattempted.length >= count) {
      pool = [...unattempted];
    } else {
      // 未解答だけでは足りない場合、不正解を混ぜる
      pool = [...unattempted, ...incorrect];
      // それでも足りない場合は全問題から（正解済みの問題も混ぜる）
      if (pool.length < count) {
        const correct = questions.filter(q => answerHistory[q.id] === true);
        pool = [...pool, ...correct];
      }
    }
    
    // ユニークなIDのみに絞る（重複を防ぐため）
    const uniqueMap = new Map<string | number, Question>();
    for (const q of pool) {
      uniqueMap.set(q.id, q);
    }
    const uniquePool = Array.from(uniqueMap.values());
    
    // シャッフルして指定件数取得
    const shuffled = shuffleWithGrouping(uniquePool).slice(0, count);
    
    setQuizFilteredQuestions(shuffled);
    setCurrentScreen('play');
    setSavedQuizState(null);
    localStorage.removeItem('saved_quiz_state');
  };

  const FESTIVAL_NOTICE = "🎪 この機能は文化祭展示中はご利用いただけません。\nぜひクイズにチャレンジしてみてください！";

  // AI Advice Center — disabled during festival
  const handleTriggerAIAdvice = async () => {
    alert(FESTIVAL_NOTICE);
  };

  // AI quiz generation — disabled during festival
  const handleStartAiQuiz = async (_difficulty: string) => {
    alert(FESTIVAL_NOTICE);
  };

  // Past quiz filtered start
  
  const handleStartQuiz = (filteredList: Question[], groupByField: boolean = false) => {
    let finalQuestions: Question[] = [];
    
    // Separate into advanced (発展・応用) and others (基礎・過去問)
    const advancedQs = filteredList.filter(q => q.type === 'advanced');
    const basicQs = filteredList.filter(q => q.type !== 'advanced');

    if (groupByField) {
      const fields = Array.from(new Set(basicQs.map(q => q.field || '未分類')));
      for (const field of fields) {
        const fieldQuestions = basicQs.filter(q => (q.field || '未分類') === field);
        // past questions: shuffle randomly
        finalQuestions.push(...[...fieldQuestions].sort(() => Math.random() - 0.5));
      }
      finalQuestions = [...finalQuestions, ...advancedQs];
    } else {
      // 基礎問題は完全にランダムに出題 (グループ化せずにシャッフル)
      const randomizedBasic = [...basicQs].sort(() => Math.random() - 0.5);
      
      // 発展・応用問題は条文ごとに出題 (元の順番を維持)
      const groupedAdvanced = groupAndKeepOrder(advancedQs);

      // 両方ある場合は基礎 -> 発展の順、あるいは一緒に
      finalQuestions = [...randomizedBasic, ...groupedAdvanced];
    }
    
    setQuizFilteredQuestions(finalQuestions);
    setCurrentScreen('play');
    setSavedQuizState(null);
    localStorage.removeItem('saved_quiz_state');
  };

  const groupAndKeepOrder = (questionsToGroup: Question[]) => {
    const groups = new Map<string, Question[]>();
    questionsToGroup.forEach(q => {
      let key = q.id.toString();
      const match = q.question.match(/^(.*?)(?:について，空欄|について、空欄|について\s*空欄|の空欄)/);
      if (match && match[1]) {
        key = match[1];
      }
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(q);
    });
    // 各条文内の問題はそのまま（あるいはシャッフル）、条文ごとの順番をランダムに並び替える
    const groupValues = Array.from(groups.values());
    const shuffledGroups = groupValues.sort(() => Math.random() - 0.5);
    return shuffledGroups.flat();
  };

  const handleResumeQuiz = () => {
    if (savedQuizState) {
      setQuizFilteredQuestions(savedQuizState.filteredQuestions);
      setCurrentScreen('play');
    }
  };

  const handleStartSingleQuestion = (question: Question) => {
    setSelectedWebMode('report');
    setQuizFilteredQuestions([question]);
    setCurrentScreen('play');
    setSavedQuizState(null);
    localStorage.removeItem('saved_quiz_state');
  };

  const handleAnswerSubmitted = async (problemId: string | number, isCorrect: boolean) => {
    const activeUserKey = auth?.currentUser?.uid || currentUser?.uid || demoUserEmail || 'guest';
    const isActuallyLoggedIntoFirebase = !isFirebaseMock && db && auth?.currentUser;
    const isPreviouslyWrong = attemptsHistory[problemId]?.length > 0 && attemptsHistory[problemId][attemptsHistory[problemId].length - 1] === false;

    setAnswerHistory(prev => ({ ...prev, [problemId]: isCorrect }));

    setAnswerTimestamps(prev => {
      const updated = { ...prev, [problemId]: Date.now() };
      try {
        localStorage.setItem(`local_answer_timestamps_${activeUserKey}`, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    setAttemptsHistory(prev => {
      const updated = { ...prev };
      const current = updated[problemId] || [];
      updated[problemId] = [...current, isCorrect].slice(-3);
      try {
        localStorage.setItem(`local_attempts_history_${activeUserKey}`, JSON.stringify(updated));
      } catch (e) {
        console.error("Local storage sync error:", e);
      }
      return updated;
    });

    setTodayStats(prev => {
      const nextAttempted = prev.attempted + 1;
      const nextCorrect = prev.correct + (isCorrect ? 1 : 0);
      saveTodayStats(activeUserKey, nextAttempted, nextCorrect);
      
      // Point system logic (only if logged into Firebase)
      if (isActuallyLoggedIntoFirebase && auth?.currentUser?.uid) {
        const uid = auth.currentUser.uid;
        // Check and update streak (runs once per day)
        checkAndUpdateStreak(uid);
        
        // Add basic answer point
        addLearningPoints(uid, 'answer');
        
        // Add correct answer point
        if (isCorrect) {
          addLearningPoints(uid, 'correct');
        }
        
        // Add review point if it was previously wrong
        if (isCorrect && isPreviouslyWrong) {
          addLearningPoints(uid, 'review');
        }
        
        // Add 10 questions point
        if (nextAttempted % 10 === 0) {
          addLearningPoints(uid, '10q');
        }
      }

      return { attempted: nextAttempted, correct: nextCorrect };
    });

    try {
      const savedHistory = JSON.parse(localStorage.getItem(`local_answers_history_${activeUserKey}`) || '{}');
      savedHistory[problemId] = isCorrect;
      localStorage.setItem(`local_answers_history_${activeUserKey}`, JSON.stringify(savedHistory));
    } catch (e) {
      console.error("Local storage error:", e);
    }

    // 卒業論文用・管理者確認用：1問解くごとにリアルタイムでFirestoreに保存する
    if (!isFirebaseMock && db && auth?.currentUser) {
      try {
        const userId = auth.currentUser.uid;
        const userEmail = effectiveEmail;
        const originalQ = questions.find(q => q.id === problemId);
        
        if (originalQ) {
          const isAi = originalQ.year === 'AI予想問題';
          const collectionName = isAi ? 'aiExamAnswers' : 'examAnswers';
          const statusDocName = isAi ? 'aiAnswerMap' : 'answerMap';

          // 1. コレクションに個別追加 (ドキュメント名にメールアドレス、問題ID、タイムスタンプを含むIDを指定して視認性を劇的に向上)
          const safeEmail = (userEmail || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
          const customDocId = `${safeEmail}_q${problemId}_${Date.now()}`;
          const examDocRef = doc(db, collectionName, customDocId);
          await setDoc(examDocRef, {
            userId,
            userEmail,
            problemId,
            field: originalQ.field || '未分類',
            questionText: originalQ.question || '',
            isCorrect,
            timestamp: serverTimestamp(),
            isAiQuestion: isAi
          });
          console.log(`Firestore: ${collectionName} にリアルタイム保存しました。ドキュメントID: ${customDocId}`);

          // 2. 個人回答状況マップ の同期マージ
          const statusRef = doc(db, `users/${userId}/status`, statusDocName);
          const currentDocSnap = await getDoc(statusRef);
          const currentData = currentDocSnap.exists() ? currentDocSnap.data() : {};

          await setDoc(statusRef, {
            answers: { ...(currentData.answers || {}), [problemId]: isCorrect },
            attempts: { ...(currentData.attempts || {}), [problemId]: [...(currentData.attempts?.[problemId] || []), isCorrect].slice(-3) },
            email: userEmail,
            lastUpdated: serverTimestamp()
          }, { merge: true });
          console.log(`Firestore: ${statusDocName} をリアルタイムマージしました。`);
        }
      } catch (err) {
        console.error("Firestoreへのリアルタイム解答保存に失敗しました(バックグラウンド):", err);
      }
    }
  };

  const [isSyncingHistory, setIsSyncingHistory] = useState(false);
  const handleManualSyncHistory = async () => {
    const activeUid = auth?.currentUser?.uid || demoUserEmail;
    if (!activeUid) return;
    setIsSyncingHistory(true);
    try {
      await loadUserHistoryFromFirestore(activeUid);
      await loadTodayStats(activeUid);
    } finally {
      setIsSyncingHistory(false);
    }
  };

  const loadUserHistoryFromFirestore = async (userId: string) => {
    if (!db) return;
    try {
      console.log("Loading history for user:", userId);
      const statusRef = doc(db, `users/${userId}/status`, 'answerMap');
      const aiStatusRef = doc(db, `users/${userId}/status`, 'aiAnswerMap');
      
      let finalAnswers: Record<string | number, boolean> = {};
      let finalAttempts: Record<string | number, boolean[]> = {};

      // 1. まず status/answerMap ドキュメントを取得して現在の実績をロード
      try {
        const statusSnap = await getDoc(statusRef);
        if (statusSnap.exists()) {
          const data = statusSnap.data();
          const ans = data.answers || {};
          const att = data.attempts || {};
          Object.entries(ans).forEach(([k, v]) => { finalAnswers[k] = v as boolean; });
          Object.entries(att).forEach(([k, v]) => { finalAttempts[k] = v as boolean[]; });
          console.log("Firestore: answerMap から直接回答履歴をロードしました。件数:", Object.keys(finalAnswers).length);
        }
      } catch (err) {
        console.warn("answerMap の読み込み警告:", err);
      }

      // 1.5 AI予想問題の進捗もロードしてマージ
      try {
        const aiStatusSnap = await getDoc(aiStatusRef);
        if (aiStatusSnap.exists()) {
          const aiData = aiStatusSnap.data();
          const aiAnswers = aiData.answers || {};
          const aiAttempts = aiData.attempts || {};
          
          Object.entries(aiAnswers).forEach(([k, v]) => { finalAnswers[k] = v as boolean; });
          Object.entries(aiAttempts).forEach(([k, v]) => { finalAttempts[k] = v as boolean[]; });
          console.log("Firestore: aiAnswerMap からAI予想問題の履歴をロードしマージしました。");
        }
      } catch (aiErr) {
        console.warn("AI予想問題の履歴ロード警告:", aiErr);
      }

      // 2. examAnswers コレクション（過去問）から該当ユーザーの個別解答ログを検索して合算
      try {
        const qUser = query(collection(db, 'examAnswers'), where('userId', '==', userId));
        const examSnap = await getDocs(qUser);
        examSnap.forEach(d => {
          const data = d.data();
          const pid = String(data.problemId);
          finalAnswers[pid] = data.isCorrect;
          if (!finalAttempts[pid]) finalAttempts[pid] = [];
          finalAttempts[pid].push(data.isCorrect);
        });
      } catch (err) {
        console.warn("examAnswers (userId) 読み込み警告:", err);
      }

      // 2.5 メールアドレスでも examAnswers を検索してマージ（UID差異やデモログイン時の救済）
      if (effectiveEmail) {
        try {
          const qEmail = query(collection(db, 'examAnswers'), where('userEmail', '==', effectiveEmail));
          const examEmailSnap = await getDocs(qEmail);
          examEmailSnap.forEach(d => {
            const data = d.data();
            const pid = String(data.problemId);
            finalAnswers[pid] = data.isCorrect;
            if (!finalAttempts[pid]) finalAttempts[pid] = [];
            finalAttempts[pid].push(data.isCorrect);
          });
        } catch (err) {
          console.warn("examAnswers (userEmail) 読み込み警告:", err);
        }
      }

      // 3. aiExamAnswers コレクションからも同様にマージ
      try {
        const aiQ = query(collection(db, 'aiExamAnswers'), where('userId', '==', userId));
        const aiExamSnap = await getDocs(aiQ);
        aiExamSnap.forEach(d => {
          const data = d.data();
          const pid = String(data.problemId);
          finalAnswers[pid] = data.isCorrect;
          if (!finalAttempts[pid]) finalAttempts[pid] = [];
          finalAttempts[pid].push(data.isCorrect);
        });
      } catch (err) {
        console.warn("aiExamAnswers 読み込み警告:", err);
      }

      // 4. sessionSummaries コレクション（セッション一括保存）からも解答をすべて復元・マージ
      try {
        const sessQ = query(collection(db, 'sessionSummaries'), where('userId', '==', userId));
        const sessSnap = await getDocs(sessQ);
        sessSnap.forEach(d => {
          const data = d.data();
          const answers = data.answers || [];
          answers.forEach((ans: any) => {
            if (ans && ans.problemId !== undefined) {
              const pid = String(ans.problemId);
              finalAnswers[pid] = ans.isCorrect;
              if (!finalAttempts[pid]) finalAttempts[pid] = [];
              finalAttempts[pid].push(ans.isCorrect);
            }
          });
        });
      } catch (err) {
        console.warn("sessionSummaries (userId) 読み込み警告:", err);
      }

      // 4.5 aiSessionSummaries コレクションからもマージ
      try {
        const aiSessQ = query(collection(db, 'aiSessionSummaries'), where('userId', '==', userId));
        const aiSessSnap = await getDocs(aiSessQ);
        aiSessSnap.forEach(d => {
          const data = d.data();
          const answers = data.answers || [];
          answers.forEach((ans: any) => {
            if (ans && ans.problemId !== undefined) {
              const pid = String(ans.problemId);
              finalAnswers[pid] = ans.isCorrect;
              if (!finalAttempts[pid]) finalAttempts[pid] = [];
              finalAttempts[pid].push(ans.isCorrect);
            }
          });
        });
      } catch (err) {
        console.warn("aiSessionSummaries 読み込み警告:", err);
      }

      // 5. localStorage の中身も補完・マージ
      let localHistory: Record<string | number, boolean> = {};
      try {
        const saved = localStorage.getItem(`local_answers_history_${userId}`);
        if (saved) localHistory = JSON.parse(saved);
      } catch (e) {}
      
      let localAttempts: Record<string | number, boolean[]> = {};
      try {
        const savedAttempts = localStorage.getItem(`local_attempts_history_${userId}`);
        if (savedAttempts) localAttempts = JSON.parse(savedAttempts);
      } catch (e) {}

      Object.entries(localHistory).forEach(([k, v]) => {
        if (finalAnswers[k] === undefined) {
          finalAnswers[k] = v as boolean;
        }
      });

      Object.entries(localAttempts).forEach(([k, v]) => {
        if (!finalAttempts[k]) {
          finalAttempts[k] = v as boolean[];
        }
      });

      // 直近の回答履歴の長さを整理
      for (const pid in finalAttempts) {
        finalAttempts[pid] = finalAttempts[pid].slice(-5);
      }

      // 6. クラウドの answerMap と aiAnswerMap に構築された完全なデータを同期・バックアップ保存
      if (Object.keys(finalAnswers).length > 0) {
        const pastAnswers: Record<string | number, boolean> = {};
        const pastAttempts: Record<string | number, boolean[]> = {};
        const aiAnswersOnly: Record<string | number, boolean> = {};
        const aiAttemptsOnly: Record<string | number, boolean[]> = {};

        Object.entries(finalAnswers).forEach(([k, v]) => {
          const foundQ = questions.find(q => String(q.id) === String(k));
          if (foundQ && foundQ.year === 'AI予想問題') {
            aiAnswersOnly[k] = v;
            if (finalAttempts[k]) aiAttemptsOnly[k] = finalAttempts[k];
          } else {
            pastAnswers[k] = v;
            if (finalAttempts[k]) pastAttempts[k] = finalAttempts[k];
          }
        });

        try {
          if (Object.keys(pastAnswers).length > 0) {
            await setDoc(statusRef, { 
              answers: pastAnswers,
              attempts: pastAttempts,
              email: effectiveEmail || '',
              lastUpdated: serverTimestamp() 
            }, { merge: true });
          }

          if (Object.keys(aiAnswersOnly).length > 0) {
            await setDoc(aiStatusRef, { 
              answers: aiAnswersOnly,
              attempts: aiAttemptsOnly,
              email: effectiveEmail || '',
              lastUpdated: serverTimestamp() 
            }, { merge: true });
          }
        } catch (syncErr) {
          console.warn("クラウドへのanswerMap同期スキップ:", syncErr);
        }
      }

      const cleanAnswers: Record<string | number, boolean> = { ...finalAnswers };
      const cleanAttempts: Record<string | number, boolean[]> = { ...finalAttempts };

      // ローカルキャッシュ（LocalStorage）に最新情報を上書き同期
      localStorage.setItem(`local_answers_history_${userId}`, JSON.stringify(cleanAnswers));
      localStorage.setItem(`local_attempts_history_${userId}`, JSON.stringify(cleanAttempts));
      
      setAnswerHistory(cleanAnswers);
      setAttemptsHistory(cleanAttempts);
      setFirebaseError(null);
      console.log(`Firestore完全ロード完了: 解答済み問題数 ${Object.keys(cleanAnswers).length}問`);

      // 過去に解いた数百問分の全解答実績から、累計ポイントを完全リカバリー＆同期
      if (!isFirebaseMock && db && auth?.currentUser?.uid === userId) {
        recalculateAndSyncAllTimePoints(userId, cleanAttempts, cleanAnswers).catch(err => {
          console.warn("Points sync failed in loadUserHistory:", err);
        });
      }
    } catch (error) {
      console.error("Firestore loading failed. Falling back to dev offline / localStorage.", error);
      setFirebaseError(error instanceof Error ? error.message : String(error));
      loadLocalHistory(userId);
    }
  };

  // セッション解答バルク同期型 (文字列ID・数値ID双方を完全保持 + 管理者分析 sessionSummaries の確実な記録)
  const syncSessionToFirestore = async (sessionHistory: Record<string | number, boolean>) => {
    if (isFirebaseMock || !auth?.currentUser || !db) return;
    
    try {
      const userId = auth.currentUser.uid;
      const userEmail = effectiveEmail;
      
      // 管理者・卒論用の sessionSummaries コレクションにレコードを新規追加する
      const answersList = Object.entries(sessionHistory).map(([idStr, isCorrect]) => {
        const originalQ = questions.find(q => String(q.id) === String(idStr));
        const pId = originalQ ? originalQ.id : (!isNaN(Number(idStr)) ? Number(idStr) : idStr);
        return {
          problemId: pId,
          field: originalQ ? (originalQ.field || '未分類') : '未分類',
          questionText: originalQ ? originalQ.question : '過去問題',
          isCorrect: isCorrect,
          isAiQuestion: originalQ ? originalQ.year === 'AI予想問題' : false
        };
      });

      if (answersList.length > 0) {
        const aiAnswers = answersList.filter(a => a.isAiQuestion);
        const pastAnswers = answersList.filter(a => !a.isAiQuestion);
        const safeEmail = (userEmail || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');

        if (pastAnswers.length > 0) {
          const total = pastAnswers.length;
          const score = pastAnswers.filter(a => a.isCorrect).length;
          const customSessionDocId = `${safeEmail}_session_${Date.now()}`;
          const sessionDocRef = doc(db, 'sessionSummaries', customSessionDocId);
          await setDoc(sessionDocRef, {
            userId,
            userEmail,
            score,
            total,
            answers: pastAnswers,
            timestamp: serverTimestamp()
          });
          console.log(`Firestore: sessionSummaries に過去問セッションを追加保存しました。ドキュメントID: ${customSessionDocId} (${score}/${total})`);
        }

        if (aiAnswers.length > 0) {
          const total = aiAnswers.length;
          const score = aiAnswers.filter(a => a.isCorrect).length;
          const customSessionDocId = `${safeEmail}_ai_session_${Date.now()}`;
          const sessionDocRef = doc(db, 'aiSessionSummaries', customSessionDocId);
          await setDoc(sessionDocRef, {
            userId,
            userEmail,
            score,
            total,
            answers: aiAnswers,
            timestamp: serverTimestamp()
          });
          console.log(`Firestore: aiSessionSummaries にAI予想問題セッションを追加保存しました。ドキュメントID: ${customSessionDocId} (${score}/${total})`);
        }
      }

      setFirebaseError(null); // 同期成功でエラーをリセット
    } catch (error) {
      console.error("Firestore同期に失敗しました:", error);
      setFirebaseError(error instanceof Error ? error.message : String(error));
      
      // AI Studio診断システム検知用
      try {
        handleFirestoreError(error, OperationType.WRITE, `users/${auth.currentUser?.uid}/status/answerMap`);
      } catch (err) {
        // キャッチしてクラッシュを防ぐ
      }
    }
  };

  // Finished or quit exam quiz play actions
  const handleProgressSnapshot = async (sessionHistory?: Record<string | number, boolean>, currentIndex?: number) => {
    // セッションを閉じたり一時中断したりした際、今回回答した分をその場でバルク同期
    // ただし、成績レポート（'report'）から1問個別で解いた場合は、handleAnswerSubmitted で既に
    // 個別の examAnswers へのリアルタイム保存と answerMap への追加が完了しているため、
    // ここで sessionSummaries への再度のバルク同期を行うと重複が発生するのでスキップします。
    if (sessionHistory && Object.keys(sessionHistory).length > 0 && selectedWebMode !== 'report') {
      await syncSessionToFirestore(sessionHistory);
    }

    if (currentIndex !== undefined && currentIndex < quizFilteredQuestions.length) {
      const stateToSave = {
        filteredQuestions: quizFilteredQuestions,
        currentIndex,
        correctCount: Object.values(sessionHistory || {}).filter(Boolean).length,
        sessionHistory: sessionHistory || {},
        mode: selectedWebMode
      };
      setSavedQuizState(stateToSave);
      localStorage.setItem('saved_quiz_state', JSON.stringify(stateToSave));
    } else {
      setSavedQuizState(null);
      localStorage.removeItem('saved_quiz_state');
    }

    if (selectedWebMode === 'report') {
      setCurrentScreen('report');
    } else {
      setCurrentScreen('dash');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative inline-flex">
            <div className="w-12 h-12 border-4 border-teal-200 border-t-teal-500 rounded-full animate-spin" />
            <GraduationCap className="w-6 h-6 text-teal-500 absolute inset-0 m-auto animate-pulse" />
          </div>
          <p className="text-xs text-gray-500 font-bold tracking-widest uppercase">
            アプリを読み込み中...
          </p>
        </div>
      </div>
    );
  }

  // If not logged-in (either firebase auth or guest demo pass)
  if (!effectiveEmail) {
    return <AuthScreen onSuccessDemoLogin={handleSuccessDemoLogin} />;
  }

  return (
    <div className={`min-h-screen bg-slate-50 font-sans text-gray-800 theme-${theme}`}>
      {/* Profile Setup Modal overlay when forced */}
      {showProfileSetup && (
        <ProfileSetupModal
          onSave={handleSaveProfile}
          userEmail={effectiveEmail}
          initialProfile={userProfile}
          onClose={userProfile ? () => setShowProfileSetup(false) : undefined}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          currentTheme={theme}
          onThemeChange={handleThemeChange}
          onEditProfile={() => {setShowSettings(false); setShowProfileSetup(true);}}
          currentUser={auth?.currentUser}
          userProfile={userProfile}
          onUpdateProfile={handleSaveProfile}
        />
      )}

      {/* Visual Header: スマホ・タブレットのみ表示（PCはサイドバー内） */}
      <header className="lg:hidden sticky top-0 bg-white border-b border-teal-50 bg-opacity-95 backdrop-blur-md z-30">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => setCurrentScreen('dash')}
            className="flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-teal-100 rounded-lg p-1 group"
          >
            <div className="p-2 bg-gradient-to-br from-teal-400 to-teal-500 rounded-xl text-white shadow-md shadow-teal-500/10 transition-transform group-hover:scale-105">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div className="hidden sm:flex flex-col items-start leading-none text-left">
              <h1 className="font-black text-sm tracking-tight text-teal-800">養護教諭対策</h1>
              <span className="text-[9px] text-teal-500 font-bold uppercase tracking-widest mt-0.5">Quiz & Partners</span>
            </div>
          </button>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Firebase Connection Status Badge (卒業論文用・管理者確認ステータス) */}
            <div className="flex items-center">
              {currentUser && !isFirebaseMock ? (
                <div className="inline-flex items-center gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl bg-emerald-50 border border-emerald-100/80 text-[10px] sm:text-xs font-bold text-emerald-600 shadow-sm transition-all whitespace-nowrap" title="Firebaseにしっかり接続され、回答状況がリアルタイム送信中になっています。">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full shrink-0 animate-pulse" />
                  <span>同期中</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl bg-amber-50 border border-amber-100 text-[10px] sm:text-xs font-bold text-amber-600 shadow-sm whitespace-nowrap" title="ローカル保存モードです。卒論集計用のデータベースに接続されていません。通常のログイン（または新規アカウント作成）をやり直してください。">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full shrink-0 animate-ping" />
                  <span>デモ (未送信)</span>
                </div>
              )}
            </div>

            {/* Notification drop trig */}
            <div className="relative">
              <button
                onClick={() => {
                  setNotifOpen(!notifOpen);
                  if (hasUnreadNotif) {
                    setHasUnreadNotif(false);
                    try {
                      localStorage.setItem('last_read_notif_id', LATEST_NOTIF_ID.toString());
                    } catch (e) {}
                  }
                }}
                className={`p-2.5 rounded-xl border border-teal-50/50 hover:bg-teal-50 hover:border-teal-100 text-teal-600 transition-all focus:outline-none relative ${
                  notifOpen ? 'bg-teal-50' : 'bg-white'
                }`}
                aria-label="Toggle notifications"
              >
                <Bell className="w-4 h-4" />
                {/* Simulated notifications badge */}
                {hasUnreadNotif && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping" />
                )}
              </button>

              <AnimatePresence>
                {notifOpen && (
                  <NotificationDropdown 
                    onClose={() => setNotifOpen(false)} 
                    userEmail={effectiveEmail} 
                    onOpenAdminMode={() => handleModeChange('admin')}
                  />
                )}
              </AnimatePresence>
            </div>

            {/* Menu Slide Draw trig */}
            <button
              onClick={() => setMenuOpen(true)}
              className="p-2.5 rounded-xl border border-teal-50/50 hover:bg-teal-50 hover:border-teal-100 text-teal-600 bg-white shadow-sm transition-all focus:outline-none"
              aria-label="Open side menu"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* SideMenu drawer drawer widget */}
      <SideMenu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        onModeSelect={handleModeChange}
        onShowDashboard={handleShowDashboard}
        onSignOut={handleSignOut}
        onTriggerAdvice={handleTriggerAIAdvice}
        userEmail={effectiveEmail}
        onSettings={() => setShowSettings(true)}
      />

      {/* PC左サイドバー（lg以上のみ表示） */}
      <div className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-56 lg:bg-white lg:border-r lg:border-teal-50 lg:z-30 lg:shadow-sm">
        {/* サイドバーロゴ */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-teal-50">
          <div className="p-2 bg-gradient-to-br from-teal-400 to-teal-500 rounded-xl text-white shadow-md shadow-teal-500/10 shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-black text-sm tracking-tight text-teal-800">養護教諭対策</span>
            <span className="text-[9px] text-teal-500 font-bold uppercase tracking-widest mt-0.5">Quiz & Partners</span>
          </div>
        </div>

        {/* サイドバーナビ */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {[
            { label: 'ホーム', icon: Home, action: () => handleTabChange('home'), active: currentScreen === 'dash' && dashTab === 'home' },
            { label: 'クイズを解く', icon: BookOpen, action: () => handleTabChange('study'), active: (currentScreen === 'dash' && dashTab === 'study') || currentScreen === 'selection' },
            { label: '成績・分析', icon: BarChart3, action: () => handleTabChange('analysis'), active: currentScreen === 'dash' && dashTab === 'analysis' },
            { label: 'フレンド', icon: Users, action: () => handleTabChange('friends'), active: currentScreen === 'friends' },
            { label: '問題レポート', icon: ClipboardList, action: () => handleTabChange('report'), active: currentScreen === 'report' },
          ].map(({ label, icon: Icon, action, active }) => (
            <button
              key={label}
              onClick={action}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-all duration-150 active:scale-95 cursor-pointer ${
                active
                  ? 'bg-teal-50 text-teal-700 border-l-4 border-teal-500 pl-2 shadow-sm'
                  : 'text-gray-500 hover:bg-slate-50 hover:text-gray-800 border-l-4 border-transparent'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-teal-600 stroke-[2.5]' : 'stroke-[1.5]'}`} />
              {label}
            </button>
          ))}
        </nav>

        {/* サイドバー下部：通知・設定 */}
        <div className="px-3 py-4 border-t border-teal-50 space-y-1">
          <button
            onClick={() => {
              setNotifOpen(!notifOpen);
              if (hasUnreadNotif) {
                setHasUnreadNotif(false);
                try { localStorage.setItem('last_read_notif_id', LATEST_NOTIF_ID.toString()); } catch (e) {}
              }
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:bg-slate-50 hover:text-gray-800 transition-all cursor-pointer relative"
          >
            <Bell className="w-4 h-4 shrink-0" />
            お知らせ
            {hasUnreadNotif && <span className="absolute top-2 left-5 w-2 h-2 bg-rose-500 rounded-full" />}
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:bg-slate-50 hover:text-gray-800 transition-all cursor-pointer"
          >
            <RefreshCw className="w-4 h-4 shrink-0" />
            設定
          </button>
        </div>
      </div>

      {/* Main Main Workspace Container */}
      <main className="lg:pl-56 max-w-full">
        <div className="max-w-6xl mx-auto px-4 py-6 lg:py-8 pb-28 lg:pb-10">
        {/* Firebase Connection Troubleshooter */}
        {firebaseError && (
          <div className="mb-6 p-6 bg-amber-50 border border-amber-200 rounded-3xl space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="font-extrabold text-sm text-amber-900 flex items-center gap-1">
                  🚨 Firebase 接続エラー (データベースが未作成の可能性があります)
                </h3>
                <p className="text-[11px] text-amber-800 leading-relaxed font-semibold">
                  現在、クラウドデータベース（Cloud Firestore）への保存・読込処理でアクセス制限エラー（Missing or insufficient permissions）が発生しています。
                </p>
                <div className="p-2.5 bg-white/70 rounded-xl text-[10px] text-amber-800 border border-amber-100 font-mono select-all overflow-x-auto max-w-full">
                  詳細ログ: {firebaseError}
                </div>
              </div>
            </div>

            <div className="border-t border-amber-200/60 pt-4 space-y-3 text-xs text-amber-900 font-medium">
              <p className="font-bold flex items-center gap-1.5 text-amber-950">
                <Shield className="w-4 h-4 text-amber-600" />
                💡 卒業論文の全解答ログを管理者画面（クラウド）に確実に保存するための修正手順：
              </p>
              
              <div className="bg-white/40 p-4 rounded-2xl border border-amber-100 space-y-4 text-[11px]">
                <div className="space-y-1">
                  <span className="font-black text-amber-950 block">手順 1. Firebase コンソールでデータベースを作成する</span>
                  <p className="text-gray-600 leading-relaxed pl-3">
                    1. <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="text-teal-600 underline font-black inline-flex items-center gap-1">Firebase Console</a> にログインします。<br />
                    2. 自治体・過去問データを管理しているプロジェクト（<span className="font-mono bg-slate-100 px-1 py-0.5 rounded text-teal-800 font-bold">data-storage-kwu</span> 等）を選択して開きます。<br />
                    3. 左メニューの <strong>「構築 (Build)」 &gt; 「Firestore Database」</strong> をクリックします。<br />
                    4. もし画面中央に <strong>「データベースの作成 (Create database)」</strong> ボタンが表示されている場合は、まだデータベースが作成されていません。作成ボタンをクリックし、進めてください（リージョンは日本 <span className="font-bold text-gray-700">asia-northeast1</span> を選ぶと最速です）。
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="font-black text-amber-950 block">手順 2. セキュリティルールを公開する</span>
                  <p className="text-gray-600 leading-relaxed pl-3">
                    1. 「Firestore Database」画面の <strong>「ルール (Rules)」</strong> タブを開きます。<br />
                    2. すべての遠隔読み書きを安全に承認するため、既存のルールを以下に書き換え、 <strong>「公開 (Publish)」</strong> をクリックします：
                  </p>
                  <pre className="bg-slate-900 text-amber-200 p-3 rounded-xl text-[10px] font-mono leading-normal select-all overflow-x-auto my-1">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}`}
                  </pre>
                </div>
              </div>

              <div className="p-3 bg-teal-50 border border-teal-100 rounded-2xl flex items-start gap-2.5 text-[11px] text-teal-900 leading-relaxed">
                <span className="text-teal-600 text-xs mt-0.5">✨</span>
                <div>
                  <span className="font-black block text-teal-950">学習はそのまま継続できます：</span>
                  システムは <strong>LocalStorage（ブラウザ内保存フォールバック）</strong> に即座に切り替わっています。クイズ演習や成績データの機能、お気に入りやアドバイス機能などはそのままオフラインモードとして安全に利用できます！
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setFirebaseError(null)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-[11px] rounded-xl transition-all cursor-pointer shadow-sm hover:scale-[1.02]"
              >
                手順を理解した（メッセージを非表示）
              </button>
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {currentScreen === 'dash' && (
            <motion.div
              key="dash"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
            >
              <Dashboard
                onModeSelect={handleModeChange}
                onResumeQuiz={handleResumeQuiz}
                hasSavedSession={savedQuizState !== null}
                questions={questions}
                answerHistory={answerHistory}
                attemptsHistory={attemptsHistory}
                answerTimestamps={answerTimestamps}
                todayStats={todayStats}
                userProfile={userProfile}
                onTriggerAdvice={handleTriggerAIAdvice}
                adviceText={adviceText}
                adviceLoading={adviceLoading}
                onStartRandom={handleStartRandom}
                activeTab={dashTab}
                onStartSingleQuestion={handleStartSingleQuestion}
                onRefreshHistory={handleManualSyncHistory}
                isSyncingHistory={isSyncingHistory}
              />
            </motion.div>
          )}

          {currentScreen === 'selection' && (
            <motion.div
              key="selection"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
            >
              <SelectionScreen
                mode={selectedWebMode}
                questions={questions}
                answerHistory={answerHistory}
                attemptsHistory={attemptsHistory}
                bookmarks={bookmarks}
                onStartQuiz={handleStartQuiz}
                onGoBack={handleShowDashboard}
                onStartAiQuiz={handleStartAiQuiz}
                aiLoading={aiQuizLoading}
              />
            </motion.div>
          )}

          {currentScreen === 'play' && (
            <motion.div
              key="play"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
            >
              <QuizPlayArea
                filteredQuestions={quizFilteredQuestions}
                onFinishQuiz={handleProgressSnapshot}
                onGoBack={handleProgressSnapshot}
                onAnswerQuestion={handleAnswerSubmitted}
                userEmail={effectiveEmail}
                resumeState={savedQuizState}
                bookmarks={bookmarks}
                onToggleBookmark={handleToggleBookmark}
              />
            </motion.div>
          )}

          {currentScreen === 'report' && (
            <motion.div
              key="report"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
            >
              <ReportScreen
                questions={questions}
                answerHistory={answerHistory}
                attemptsHistory={attemptsHistory}
                answerTimestamps={answerTimestamps}
                bookmarks={bookmarks}
                onToggleBookmark={handleToggleBookmark}
                onGoBack={handleShowDashboard}
                onStartSingleQuestion={handleStartSingleQuestion}
              />
            </motion.div>
          )}

          {currentScreen === 'friends' && (
            <motion.div
              key="friends"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
            >
              <FriendsScreen
                onGoBack={handleShowDashboard}
                currentUser={auth?.currentUser || null}
                userProfile={userProfile}
                onEditProfile={() => setShowProfileSetup(true)}
                attemptsHistory={attemptsHistory}
                answerHistory={answerHistory}
              />
            </motion.div>
          )}

          {currentScreen === 'admin' && (
            <motion.div
              key="admin"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
            >
              <AdminDashboard
                onGoBack={handleShowDashboard}
                userEmail={effectiveEmail}
              />
            </motion.div>
          )}

          {currentScreen === 'pdf-maker' && (
            <motion.div
              key="pdf-maker"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
            >
              <PdfMaker onBack={handleShowDashboard} />
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </main>

      {/* Bottom Navigation Bar：スマホ・タブレットのみ表示 */}
      {currentScreen !== 'play' && currentScreen !== 'admin' && currentScreen !== 'pdf-maker' && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-[0_-4px_24px_-6px_rgba(0,0,0,0.12)] z-40 pb-safe">
          <div className="max-w-4xl mx-auto flex justify-between">
            {(() => {
              const tabs = [
                { key: 'home' as const, label: 'ホーム', icon: Home, active: currentScreen === 'dash' && dashTab === 'home' },
                { key: 'study' as const, label: 'クイズ', icon: BookOpen, active: (currentScreen === 'dash' && dashTab === 'study') || currentScreen === 'selection' },
                { key: 'analysis' as const, label: '成績', icon: BarChart3, active: currentScreen === 'dash' && dashTab === 'analysis' },
                { key: 'friends' as const, label: 'フレンド', icon: Users, active: currentScreen === 'friends' },
                { key: 'report' as const, label: 'レポート', icon: ClipboardList, active: currentScreen === 'report' },
              ];
              return tabs.map(({ key, label, icon: Icon, active }) => (
                <button
                  key={key}
                  onClick={() => handleTabChange(key)}
                  className={`flex-1 pt-1 pb-3 flex flex-col items-center gap-1 transition-all duration-150 active:scale-95 cursor-pointer relative ${
                    active ? 'text-teal-600' : 'text-gray-400'
                  }`}
                >
                  {/* アクティブインジケーター（上線） */}
                  <span className={`absolute top-0 left-2 right-2 h-0.5 rounded-b-full transition-all duration-200 ${active ? 'bg-teal-500' : 'bg-transparent'}`} />
                  {/* アイコン背景 */}
                  <span className={`p-1.5 rounded-xl transition-all duration-200 ${active ? 'bg-teal-50' : ''}`}>
                    <Icon className={`w-5 h-5 transition-all duration-200 ${active ? 'stroke-[2.5]' : 'stroke-[1.5]'}`} />
                  </span>
                  <span className={`text-xs font-bold transition-all duration-200 ${active ? 'text-teal-700' : 'text-gray-400'}`}>{label}</span>
                </button>
              ));
            })()}
          </div>
        </div>
      )}

      {/* Interactive Footer decorative */}
      <footer className="lg:pl-56 py-6 bg-white border-t border-teal-50/50 pb-24 lg:pb-6">
        <div className="max-w-4xl mx-auto px-4 text-center space-y-2">
          <p className="text-xs text-gray-400 font-medium">
            © 2026 養護教諭採用試験 過去問クイズアプリ | Supported by Gemini 3.5-flash
          </p>
        </div>
      </footer>
    </div>
  );
}
