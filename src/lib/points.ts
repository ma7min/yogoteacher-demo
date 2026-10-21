import { db, auth } from './firebase';
import { doc, getDoc, setDoc, increment, serverTimestamp, writeBatch, collection, addDoc } from 'firebase/firestore';

export type PointReason = 
  | 'answer'    // +1pt
  | 'correct'   // +2pt
  | '10q'       // +5pt
  | 'review'    // +3pt
  | 'streak3'   // +10pt
  | 'streak7';  // +20pt

export const getPointsForReason = (reason: PointReason): number => {
  switch (reason) {
    case 'answer': return 1;
    case 'correct': return 2;
    case 'review': return 3;
    case '10q': return 5;
    case 'streak3': return 10;
    case 'streak7': return 20;
    default: return 0;
  }
};

export const addLearningPoints = async (userId: string, reason: PointReason, additionalData?: any) => {
  if (!db || !userId) return;
  
  const points = getPointsForReason(reason);
  if (points === 0) return;

  try {
    const userRef = doc(db, 'users', userId);
    
    // Add points using increment
    await setDoc(userRef, {
      points: {
        weekly: increment(points),
        monthly: increment(points),
        allTime: increment(points)
      },
      lastActivityAt: serverTimestamp()
    }, { merge: true });

    // Try to save activity feed if the user has public activities enabled
    const userDoc = await getDoc(userRef);
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const privacy = userData.privacySettings || {};
      
      // If activity share is on (default true if not set)
      if (privacy.shareActivity !== false) {
        let activityMessage = '';
        
        if (reason === '10q') activityMessage = '10問達成しました！';
        else if (reason === 'streak3') activityMessage = '3日連続学習を達成しました！';
        else if (reason === 'streak7') activityMessage = '7日連続学習を達成しました！';
        // Only log significant activities, not single answers to avoid spam
        
        if (activityMessage) {
          await addDoc(collection(db, 'activities'), {
            userId,
            userName: userData.diaryName || '匿名ユーザー',
            message: activityMessage,
            type: reason,
            cheers: [],
            timestamp: serverTimestamp()
          });
        }
      }
    }
    
  } catch (err) {
    console.error("Failed to add points:", err);
  }
};

export const checkAndUpdateStreak = async (userId: string): Promise<boolean> => {
  if (!db || !userId) return false;
  
  try {
    const userRef = doc(db, 'users', userId);
    const docSnap = await getDoc(userRef);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      const lastStudyStr = data.lastStudyDate || '';
      let streak = data.streakDays || 0;
      
      if (lastStudyStr === todayStr) {
        // Already studied today
        return false;
      }
      
      if (lastStudyStr) {
        const lastStudy = new Date(lastStudyStr);
        const diffTime = Math.abs(today.getTime() - lastStudy.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
          // Studied yesterday, increment streak
          streak += 1;
        } else if (diffDays > 1) {
          // Streak broken
          streak = 1;
        }
      } else {
        streak = 1;
      }
      
      await setDoc(userRef, {
        lastStudyDate: todayStr,
        streakDays: streak
      }, { merge: true });
      
      // Award points for streak
      if (streak === 3) {
        await addLearningPoints(userId, 'streak3');
      } else if (streak === 7 || streak % 7 === 0) {
        // give 7-day points every 7 days? Or just once? Let's just do it at 7
        await addLearningPoints(userId, 'streak7');
      }
      
      return true;
    } else {
      // First time
      await setDoc(userRef, {
        lastStudyDate: todayStr,
        streakDays: 1,
        points: { weekly: 0, monthly: 0, allTime: 0 }
      }, { merge: true });
      return true;
    }
  } catch (err) {
    console.error("Streak update error:", err);
    return false;
  }
};

/**
 * 過去の全解答実績（attemptsHistory, answersHistory等）から
 * 獲得ポイントを正確に再集計し、Firestoreに同期保存する
 */
export const recalculateAndSyncAllTimePoints = async (
  userId: string,
  attemptsHistory: Record<string | number, boolean[]>,
  answersHistory: Record<string | number, boolean>
): Promise<number> => {
  if (!db || !userId) return 0;

  try {
    let totalAttemptsCount = 0;
    let totalCorrectCount = 0;

    // 1. attemptsHistoryの全履歴を集計
    if (attemptsHistory) {
      Object.values(attemptsHistory).forEach(attempts => {
        if (Array.isArray(attempts)) {
          totalAttemptsCount += attempts.length;
          totalCorrectCount += attempts.filter(Boolean).length;
        }
      });
    }

    // 2. answersHistoryのうちattemptsに入っていない分を補完
    if (answersHistory) {
      Object.entries(answersHistory).forEach(([pid, isCorrect]) => {
        if (!attemptsHistory || !attemptsHistory[pid] || attemptsHistory[pid].length === 0) {
          totalAttemptsCount += 1;
          if (isCorrect) totalCorrectCount += 1;
        }
      });
    }

    // ポイント計算ルール:
    // 解答ポイント: 1問解くごとに +1pt
    // 正解ボーナス: 正解ごとに +2pt (計3pt)
    // 10問達成ボーナス: 10問解くごとに +5pt
    const answerPoints = totalAttemptsCount * 1;
    const correctPoints = totalCorrectCount * 2;
    const tenQBonus = Math.floor(totalAttemptsCount / 10) * 5;

    const calculatedAllTime = answerPoints + correctPoints + tenQBonus;

    // 現在のFirestore上のポイントを取得し、より高い値を採用（獲得済みストリークボーナスを保護）
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    const currentPoints = snap.exists() ? snap.data().points : null;
    const existingAllTime = currentPoints?.allTime || 0;
    const existingMonthly = currentPoints?.monthly || 0;
    const existingWeekly = currentPoints?.weekly || 0;

    const finalAllTime = Math.max(calculatedAllTime, existingAllTime);
    // monthlyやweeklyが極端に少ない場合の底上げ
    const finalMonthly = Math.max(existingMonthly, Math.min(finalAllTime, Math.max(100, Math.floor(finalAllTime * 0.4))));
    const finalWeekly = Math.max(existingWeekly, Math.min(finalAllTime, Math.max(50, Math.floor(finalAllTime * 0.2))));

    await setDoc(userRef, {
      points: {
        allTime: finalAllTime,
        monthly: finalMonthly,
        weekly: finalWeekly
      },
      lastPointsRecalculatedAt: serverTimestamp()
    }, { merge: true });

    console.log(`[Points] Recalculated for ${userId}: attempts=${totalAttemptsCount}, correct=${totalCorrectCount}, calculated=${calculatedAllTime}, final=${finalAllTime}`);
    return finalAllTime;
  } catch (err) {
    console.error("Failed to recalculate user points:", err);
    return 0;
  }
};

