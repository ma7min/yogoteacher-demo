import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Users, Trophy, Heart, Edit2, RefreshCw, Sparkles, CheckCircle2, Award, Zap } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy, limit, doc, getDoc, setDoc, addDoc, updateDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { recalculateAndSyncAllTimePoints } from '../lib/points';

interface FriendsScreenProps {
  onGoBack: () => void;
  currentUser: any;
  userProfile: any;
  onEditProfile: () => void;
  attemptsHistory?: Record<string | number, boolean[]>;
  answerHistory?: Record<string | number, boolean>;
}

export const FriendsScreen: React.FC<FriendsScreenProps> = ({ 
  onGoBack, 
  currentUser, 
  userProfile, 
  onEditProfile,
  attemptsHistory = {},
  answerHistory = {}
}) => {
  const [activeTab, setActiveTab] = useState<'ranking' | 'feed' | 'friends'>('ranking');
  const [rankingPeriod, setRankingPeriod] = useState<'allTime' | 'monthly' | 'weekly'>('allTime');

  const [allUsersData, setAllUsersData] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  
  const [searchId, setSearchId] = useState('');
  const [searchResult, setSearchResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [recalcSuccessMsg, setRecalcSuccessMsg] = useState<string | null>(null);

  // マウント時に累計ポイントの自動再計算＆ランキング取得を実行
  useEffect(() => {
    if (!currentUser || !db) return;
    
    // 過去に解いた問題数からポイントを自動再集計・同期
    handleAutoSyncPoints();

    fetchRankings();
    if (activeTab === 'feed') fetchActivities();
    if (activeTab === 'friends') fetchFriends();
  }, [activeTab, currentUser]);

  // 過去の解答履歴から累計ポイントを自動再集計してFirestoreと同期
  const handleAutoSyncPoints = async () => {
    if (!currentUser?.uid || !db) return;
    try {
      // ローカルストレージからも最新の解答データをマージして確実に集計
      let effectiveAttempts = { ...attemptsHistory };
      let effectiveAnswers = { ...answerHistory };

      try {
        const localAtt = localStorage.getItem(`local_attempts_history_${currentUser.uid}`);
        if (localAtt) {
          effectiveAttempts = { ...effectiveAttempts, ...JSON.parse(localAtt) };
        }
        const localAns = localStorage.getItem(`local_answers_history_${currentUser.uid}`);
        if (localAns) {
          effectiveAnswers = { ...effectiveAnswers, ...JSON.parse(localAns) };
        }
      } catch (e) {}

      await recalculateAndSyncAllTimePoints(currentUser.uid, effectiveAttempts, effectiveAnswers);
    } catch (err) {
      console.warn("Auto points sync failed:", err);
    }
  };

  // ユーザーが手動で押せる「ポイント再計算・同期」ボタン
  const handleManualRecalculate = async () => {
    if (!currentUser?.uid || !db) return;
    setIsRecalculating(true);
    setRecalcSuccessMsg(null);
    try {
      let effectiveAttempts = { ...attemptsHistory };
      let effectiveAnswers = { ...answerHistory };

      try {
        const localAtt = localStorage.getItem(`local_attempts_history_${currentUser.uid}`);
        if (localAtt) effectiveAttempts = { ...effectiveAttempts, ...JSON.parse(localAtt) };
        const localAns = localStorage.getItem(`local_answers_history_${currentUser.uid}`);
        if (localAns) effectiveAnswers = { ...effectiveAnswers, ...JSON.parse(localAns) };
      } catch (e) {}

      const newPoints = await recalculateAndSyncAllTimePoints(currentUser.uid, effectiveAttempts, effectiveAnswers);
      await fetchRankings();
      setRecalcSuccessMsg(`全解答履歴から再集計し、累計 ${newPoints.toLocaleString()} pt に更新しました！`);
      setTimeout(() => setRecalcSuccessMsg(null), 5000);
    } catch (err) {
      console.error("Manual recalculation failed:", err);
      alert("ポイントの再計算に失敗しました。時間をおいてお試しください。");
    } finally {
      setIsRecalculating(false);
    }
  };

  // 全ユーザーデータを確実に取得し、累計ポイントを正しくソート
  const fetchRankings = async () => {
    setIsLoading(true);
    try {
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      
      const loadedUsers = snapshot.docs.map((docSnap) => {
        const uData = docSnap.data();
        let department = uData.department || '';
        let grade = uData.grade || '';

        // 現在のユーザー自身の場合は最新のuserProfileを優先結合
        if (docSnap.id === currentUser?.uid && userProfile) {
          department = userProfile.department || department;
          grade = userProfile.grade || grade;
        }

        // ポイントオブジェクトの安全な集計
        const pointsObj = uData.points || {};
        const weekly = Number(pointsObj.weekly) || 0;
        const monthly = Number(pointsObj.monthly) || weekly;
        const allTime = Number(pointsObj.allTime) || Math.max(monthly, weekly, 0);

        return {
          id: docSnap.id,
          ...uData,
          diaryName: uData.diaryName || (docSnap.id === currentUser?.uid ? userProfile?.diaryName : '') || '匿名ユーザー',
          department,
          grade,
          points: {
            weekly,
            monthly,
            allTime,
          },
          streakDays: uData.streakDays || 0,
        };
      });

      // 現在のユーザーが未登録の場合の補完
      if (currentUser?.uid && !loadedUsers.some(u => u.id === currentUser.uid)) {
        loadedUsers.push({
          id: currentUser.uid,
          diaryName: userProfile?.diaryName || 'あなた',
          department: userProfile?.department || '',
          grade: userProfile?.grade || '',
          points: { weekly: 0, monthly: 0, allTime: 0 },
          streakDays: 1,
        });
      }

      setAllUsersData(loadedUsers);
    } catch (err) {
      console.error("ランキングの取得に失敗しました:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // 選択された期間（累計・今月・今週）に基づくソート
  const sortedRankings = useMemo(() => {
    const list = [...allUsersData];
    list.sort((a, b) => {
      const ptsA = Number(a.points?.[rankingPeriod]) || 0;
      const ptsB = Number(b.points?.[rankingPeriod]) || 0;
      return ptsB - ptsA;
    });
    return list;
  }, [allUsersData, rankingPeriod]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await handleAutoSyncPoints();
    await fetchRankings();
  };

  const fetchActivities = async () => {
    try {
      const actRef = collection(db, 'activities');
      const q = query(actRef, orderBy('timestamp', 'desc'), limit(30));
      const snapshot = await getDocs(q);
      setActivities(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (err) {
      console.error(err);
    }
  };

  const fetchFriends = async () => {
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, limit(10));
      const snapshot = await getDocs(q);
      setFriends(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(u => u.id !== currentUser?.uid));
    } catch (err) {
      console.error(err);
    }
  };

  const handleSearchFriend = async () => {
    if (!searchId || !currentUser) return;
    setIsLoading(true);
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('diaryName', '==', searchId.trim()), limit(1));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const foundUser = snapshot.docs[0];
        if (foundUser.id === currentUser.uid) {
          alert('自分自身は追加できません');
          setSearchResult(null);
        } else {
          setSearchResult({ id: foundUser.id, ...foundUser.data() });
        }
      } else {
        setSearchResult(null);
        alert('ユーザーが見つかりませんでした');
      }
    } catch (err) {
      console.error(err);
    }
    setIsLoading(false);
  };

  const handleSendRequest = async () => {
    if (!searchResult || !currentUser) return;
    try {
      await addDoc(collection(db, 'friendRequests'), {
        fromUid: currentUser.uid,
        toUid: searchResult.id,
        fromName: userProfile?.diaryName || '匿名ユーザー',
        status: 'pending',
        timestamp: serverTimestamp()
      });
      alert('フレンド申請を送信しました！');
      setSearchResult(null);
      setSearchId('');
    } catch (err) {
      console.error(err);
      alert('申請に失敗しました');
    }
  };

  const handleCheer = async (activityId: string) => {
    try {
      const actRef = doc(db, 'activities', activityId);
      await updateDoc(actRef, {
        cheers: arrayUnion(currentUser.uid)
      });
      fetchActivities();
    } catch (err) {
      console.error(err);
    }
  };

  // 現在のユーザーの順位とポイント
  const myRank = useMemo(() => {
    const idx = sortedRankings.findIndex(u => u.id === currentUser?.uid);
    if (idx === -1) return null;
    return {
      rank: idx + 1,
      points: sortedRankings[idx]?.points?.[rankingPeriod] || 0
    };
  }, [sortedRankings, currentUser, rankingPeriod]);

  return (
    <div className="space-y-6 pb-20 pt-4 px-4 max-w-4xl mx-auto">
      {/* 画面ヘッダー */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-bold text-teal-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-teal-600" />
            フレンド＆ランキング
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            日々の演習ポイントで仲間と切磋琢磨しよう
          </p>
        </div>
        <button
          onClick={onEditProfile}
          className="flex items-center gap-1.5 text-xs font-bold text-teal-600 bg-teal-50 px-3 py-1.5 rounded-full hover:bg-teal-100 transition-colors cursor-pointer border border-teal-200/50"
        >
          <Edit2 className="w-3.5 h-3.5" />
          プロフィール変更
        </button>
      </div>

      {/* メインタブ切り替え */}
      <div className="flex bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden p-1 gap-1">
        <button
          onClick={() => setActiveTab('ranking')}
          className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'ranking' ? 'bg-teal-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Trophy className="w-4 h-4" />
          ランキング
        </button>
        <button
          onClick={() => setActiveTab('feed')}
          className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'feed' ? 'bg-teal-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Heart className="w-4 h-4" />
          活動フィード
        </button>
        <button
          onClick={() => setActiveTab('friends')}
          className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'friends' ? 'bg-teal-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Users className="w-4 h-4" />
          フレンド
        </button>
      </div>

      {/* ランキングタブ */}
      {activeTab === 'ranking' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          
          {/* ポイント再計算完了メッセージ */}
          {recalcSuccessMsg && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{recalcSuccessMsg}</span>
            </div>
          )}

          {/* 集計期間の切り替え（累計・今月・今週） & 更新ボタン */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
              <button 
                onClick={() => setRankingPeriod('allTime')} 
                className={`flex-1 sm:px-6 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  rankingPeriod === 'allTime' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                累計ポイント
              </button>
              <button 
                onClick={() => setRankingPeriod('monthly')} 
                className={`flex-1 sm:px-6 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  rankingPeriod === 'monthly' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                今月
              </button>
              <button 
                onClick={() => setRankingPeriod('weekly')} 
                className={`flex-1 sm:px-6 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  rankingPeriod === 'weekly' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                今週
              </button>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              {/* 解答履歴から全ポイントを再計算するボタン */}
              <button
                onClick={handleManualRecalculate}
                disabled={isRecalculating || isLoading}
                className="flex items-center gap-1.5 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200/60 px-3.5 py-2 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                title="これまで解いた全問題の履歴から累計ポイントを完全再計算して同期します"
              >
                <Zap className={`w-3.5 h-3.5 text-amber-500 ${isRecalculating ? 'animate-bounce' : ''}`} />
                <span>{isRecalculating ? 'ポイント再計算中...' : '累計ポイントを再集計'}</span>
              </button>

              <button
                onClick={handleRefresh}
                disabled={isRefreshing || isLoading}
                className="p-2 text-slate-500 hover:text-teal-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                title="ランキングを更新"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-teal-600' : ''}`} />
              </button>
            </div>
          </div>

          {/* あなたの現在の順位バナー */}
          {myRank && (
            <div className="bg-gradient-to-r from-teal-500 to-emerald-500 text-white p-4 rounded-2xl shadow-md flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-black text-lg">
                  {myRank.rank}位
                </div>
                <div>
                  <p className="text-xs text-teal-100 font-bold">あなたの現在の順位（{rankingPeriod === 'allTime' ? '累計' : rankingPeriod === 'monthly' ? '今月' : '今週'}）</p>
                  <p className="font-bold text-base">{userProfile?.diaryName || 'あなた'}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black">{myRank.points.toLocaleString()} <span className="text-xs font-normal">pt</span></p>
              </div>
            </div>
          )}

          {/* ランキングリスト一覧 */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="bg-slate-50/70 px-4 py-2.5 border-b border-slate-100 flex items-center justify-between text-xs font-bold text-slate-500">
              <span>順位 / ユーザー</span>
              <span>
                {rankingPeriod === 'allTime' ? '累計' : rankingPeriod === 'monthly' ? '今月' : '今週'}の獲得ポイント
              </span>
            </div>

            {isLoading && allUsersData.length === 0 ? (
              <div className="text-center py-12 text-slate-400 font-bold text-sm flex flex-col items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-teal-500" />
                <span>ランキング集計中...</span>
              </div>
            ) : sortedRankings.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {sortedRankings.map((user, idx) => {
                  const isMe = user.id === currentUser?.uid;
                  const pts = user.points?.[rankingPeriod] || 0;
                  
                  return (
                    <div 
                      key={user.id} 
                      className={`flex items-center justify-between p-4 transition-colors ${
                        isMe ? 'bg-teal-50/70 border-l-4 border-teal-500' : 'hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-center gap-3 sm:gap-4">
                        {/* 順位アイコン */}
                        <div className="w-8 flex justify-center items-center">
                          {idx === 0 ? (
                            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                              <Trophy className="w-5 h-5 text-amber-500" />
                            </div>
                          ) : idx === 1 ? (
                            <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center">
                              <Trophy className="w-4 h-4 text-slate-500" />
                            </div>
                          ) : idx === 2 ? (
                            <div className="w-7 h-7 rounded-full bg-amber-200/60 flex items-center justify-center">
                              <Trophy className="w-4 h-4 text-amber-700" />
                            </div>
                          ) : (
                            <span className="font-black text-slate-400 text-sm sm:text-base">{idx + 1}</span>
                          )}
                        </div>

                        {/* ユーザー名 & 所属 */}
                        <div className="space-y-0.5">
                          <div className="flex items-center flex-wrap gap-1.5">
                            <p className={`font-bold text-sm sm:text-base ${isMe ? 'text-teal-900' : 'text-slate-800'}`}>
                              {user.diaryName || '匿名ユーザー'}
                            </p>
                            {isMe && (
                              <span className="text-[10px] bg-teal-500 text-white font-black px-2 py-0.5 rounded-full shadow-xs">
                                あなた
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-slate-400">
                            {user.department && (
                              <span className="text-teal-600 font-semibold">{user.department}</span>
                            )}
                            {user.grade && (
                              <span>{user.grade}</span>
                            )}
                            {user.streakDays > 0 && (
                              <span className="text-amber-600 font-bold">
                                🔥 {user.streakDays}日連続
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* ポイント表示 */}
                      <div className="text-right pl-2">
                        <p className="font-black text-teal-600 text-base sm:text-lg tracking-tight">
                          {pts.toLocaleString()} <span className="text-xs font-normal text-slate-500">pt</span>
                        </p>
                        <span className="text-[9px] text-slate-400">
                          {rankingPeriod === 'allTime' ? '累計' : rankingPeriod === 'monthly' ? '月間' : '週間'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400 text-sm">
                <p className="font-bold">データがありません</p>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* 活動フィードタブ */}
      {activeTab === 'feed' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {isLoading ? (
            <p className="text-center py-10 text-slate-400 font-bold text-sm">読み込み中...</p>
          ) : activities.length > 0 ? (
            activities.map(act => {
              const isCheered = act.cheers?.includes(currentUser?.uid);
              return (
                <div key={act.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center text-teal-600 font-bold">
                      {(act.userName || '匿').charAt(0)}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-800">{act.userName}</p>
                      <p className="text-xs text-teal-700 font-medium mt-0.5">{act.message}</p>
                      <div className="flex items-center gap-4 mt-3">
                        <button 
                          onClick={() => handleCheer(act.id)}
                          className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition-colors cursor-pointer ${
                            isCheered ? 'bg-rose-50 text-rose-500' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                          }`}
                        >
                          <Heart className={`w-3.5 h-3.5 ${isCheered ? 'fill-rose-500' : ''}`} />
                          応援する {act.cheers?.length > 0 && <span>({act.cheers.length})</span>}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-center py-10 text-slate-400 text-sm">最近の活動がありません</p>
          )}
        </motion.div>
      )}

      {/* フレンドタブ */}
      {activeTab === 'friends' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-700 text-sm mb-3">フレンド追加</h3>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={searchId}
                onChange={e => setSearchId(e.target.value)}
                placeholder="ユーザー名（日記ネーム）を入力" 
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 font-medium"
              />
              <button 
                onClick={handleSearchFriend}
                className="bg-teal-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-teal-700 transition-colors cursor-pointer"
              >
                検索
              </button>
            </div>
            
            {searchResult && (
              <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-800">{searchResult.diaryName}</p>
                  <p className="text-xs text-slate-500">
                    {searchResult.department ? `[${searchResult.department}] ` : ''}連続 {searchResult.streakDays || 0}日
                  </p>
                </div>
                <button 
                  onClick={handleSendRequest}
                  className="bg-white border border-teal-200 text-teal-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-teal-50 cursor-pointer"
                >
                  申請する
                </button>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <h3 className="font-bold text-slate-700 text-sm p-4 border-b border-slate-50">フレンド一覧</h3>
            {friends.length > 0 ? (
              <div className="divide-y divide-slate-50">
                {friends.map(f => (
                  <div key={f.id} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 font-bold">
                        {(f.diaryName || '匿').charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-slate-700">{f.diaryName || '匿名ユーザー'}</p>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          {f.department && <span>{f.department}</span>}
                          <span>今週: {f.points?.weekly || 0}pt</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center py-8 text-slate-400 text-sm">まだフレンドがいません</p>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
};
