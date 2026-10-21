import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

// Initialize Firebase Admin gracefully
if (!getApps().length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      initializeApp({
        credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY))
      });
      console.log("Firebase Admin initialized successfully.");
    } else {
      console.warn("FIREBASE_SERVICE_ACCOUNT_KEY is not set. Scheduled notifications API will not work until set.");
    }
  } catch (e) {
    console.error("Error initializing Firebase Admin:", e);
  }
}

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Initialize Gemini Client server-side conforming to guide
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // === CORS-bypass Proxy for Firebase Storage ===
  app.get("/api/proxy", async (req, res) => {
    try {
      const url = req.query.url as string;
      if (!url) {
        return res.status(400).send("Missing url parameter");
      }
      
      // Security check: Only allow Firebase Storage domains
      if (!url.startsWith("https://firebasestorage.googleapis.com/")) {
        return res.status(403).send("Forbidden: Only Firebase Storage URLs are allowed to be proxied.");
      }
      
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(response.status).send(`Failed to fetch original file: ${response.statusText}`);
      }
      
      const contentType = response.headers.get("content-type") || "application/octet-stream";
      res.setHeader("Content-Type", contentType);
      
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      res.send(buffer);
    } catch (error: any) {
      console.error("Proxy error:", error);
      res.status(500).send(error.message || "Proxy internal error");
    }
  });

  // === API ENDPOINTS FIRST ===
  
  // 1. Generate Learning Advice using Gemini
  app.post("/api/gemini/advice", async (req, res) => {
    try {
      const { history } = req.body;
      
      let statsText = "学習履歴がありません。まずは過去問をいくつか解いてみましょう！";
      
      if (Array.isArray(history) && history.length > 0) {
        const total = history.length;
        const correct = history.filter((h: any) => h.isCorrect).length;
        const rate = (correct / total) * 100;
        
        // 分野別の集計を表示
        const fields: { [key: string]: { total: number, correct: number } } = {};
        history.forEach((h: any) => {
          const f = h.field || "未分類";
          if (!fields[f]) fields[f] = { total: 0, correct: 0 };
          fields[f].total++;
          if (h.isCorrect) fields[f].correct++;
        });

        let fieldSummary = Object.entries(fields)
          .map(([f, s]) => `- ${f}: ${s.correct}/${s.total} 正解 (正答率 ${((s.correct / s.total) * 100).toFixed(0)}%)`)
          .join("\n");

        statsText = `これまでの学習状況：
累計解答数: ${total}問
正解数: ${correct}問
全体正答率: ${rate.toFixed(1)}%

分野別の状況:
${fieldSummary}`;
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `受講生の解答状況を踏まえて、養護教諭採用試験の客観的な学習アドバイスを生成してください。
        
${statsText}

上記の結果を客観的かつ具体的に分析し、以下の内容をMarkdown形式で教えてください。
1. 現在の学習状況の客観的な分析（強みがある分野の評価、未学習または正答率の低い分野への具体的な学習ポイント）
2. 日常の学習努力を敬意を持って認めつつ、次に向けたモチベーションを高めるための簡潔な応援メッセージ`,
        config: {
          systemInstruction: "あなたは養護教諭採用試験の専門対策アドバイザーです。保健室や養護教諭としての特定のキャラクター設定やロールプレイは行わず、客観的な学習状況データや試験対策の学問的・法的な根拠に基づき、淡々と、かつ受講生のこれまでの努力を優しく認める温かみを含めた実用的なアドバイスを提供してください。"
        }
      });

      res.json({ advice: response.text });
    } catch (error: any) {
      console.error("Advice Generation Error:", error);
      res.status(500).json({ error: error.message || "アドバイスの生成に失敗しました。" });
    }
  });

  // 2. Generate customized practice question using Gemini
  app.post("/api/gemini/generate-questions", async (req, res) => {
    try {
      const { difficulty } = req.body; // "1"〜"5" の5段階
      
      let diffLabel = "標準(中級)";
      if (difficulty === "1") diffLabel = "基礎・基本・教養の基礎(初級・レベル1 / 5)";
      else if (difficulty === "2") diffLabel = "重要単語・典型問題(初中級・レベル2 / 5)";
      else if (difficulty === "3") diffLabel = "標準レベル・頻出問題(中級・レベル3 / 5)";
      else if (difficulty === "4") diffLabel = "応用・発展・ややひねりのある実践問題(中上級・レベル4 / 5)";
      else if (difficulty === "5") diffLabel = "最難関・実戦的ひねりや多方向の法的解釈を問う超難問(上級・レベル5 / 5)";
      
      const prompt = `養護教諭採用試験（専門教養）の予想問題を5問作成してください。
難易度は「${diffLabel}」とし、実際の過去問（学校保健安全法、健康相談、救急処置、解剖生理、小児保健、疾病の予防、環境衛生、安全など）の傾向をベースに、きわめて正確で法的に間違いない内容にしてください。
選択肢は5つまたは4つのボタン型とし、1つは正解にしてください。
詳細な解説（なぜそれが正答で、他が誤答なのかの解説）も深くわかりやすく記述してください。

【問題文の作成に関する重要ルール（厳守）】
1. 問題文内の指示文の（　　）と問題文の（　　）の種類を必ず統一させてください。「［　　］」で指示文を出しているのに、問題文は「（　　）」になっているという状態は絶対にやめてください。
2. 問題の（　　）がひとつの場合は、（　ア　）などと指定があっても、中身の文字や数字は消して「（　　）」としてください。
3. （　　）は縮めずに全角スペースを入れて「（　　）」のようにゆとりを持たせるようにしてください。「（）」のように詰めてはいけません。
4. 私が指示していない場合、問題文を勝手に改変しないでください。`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.INTEGER, description: "ダミーのランダムID (e.g. 1001～)" },
                year: { type: Type.STRING, description: "年度（例：AI予想問題）" },
                prefecture: { type: Type.STRING, description: "出題名（例：AIジェネレーティブ：難易度レベルなど）" },
                field: { type: Type.STRING, description: "出題分野。'学校保健安全法', '健康相談', '解剖生理', '救急処置', '小児保健', '疾病の予防', '栄養・食品衛生', '環境衛生', '学校組織・運営' のいずれか" },
                difficulty: { type: Type.STRING, description: "難易度（例：'1'、'2'、'3'、'4'、'5'）" },
                question: { type: Type.STRING, description: "問題文。HTMLタグ（<br>など）を含めてもよい。とても精緻な内容にすること" },
                choices: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "4つまたは5つの選択肢"
                },
                answer: { type: Type.INTEGER, description: "正解の選択肢の番号（1から始まるインデックス、例：1）" },
                explanation: { type: Type.STRING, description: "解答の詳細な解説（根拠法、解説詳細）" }
              },
              required: ["id", "year", "prefecture", "field", "difficulty", "question", "choices", "answer", "explanation"]
            }
          }
        }
      });

      const rootText = response.text || "{}";
      const cleanedText = rootText.trim();
      const generatedQuestion = JSON.parse(cleanedText);

      res.json({ questions: generatedQuestion });
    } catch (error: any) {
      console.error("AI Question Generation Error:", error);
      res.status(500).json({ error: error.message || "問題の生成に失敗しました。" });
    }
  });

  
  // 3. API for scheduled notifications (Cron Job target)
  const handleCronNotifications = async (req: express.Request, res: express.Response) => {
    // Basic protection (optional but recommended in production)
    const secret = req.headers['x-cron-secret'] || req.query.secret;
    if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!getApps().length) {
      return res.status(200).json({ 
        status: "ok",
        message: "Firebase Admin is not configured with service account yet, but cron request was received successfully." 
      });
    }

    try {
      // Get current JST time
      const now = new Date();
      const jstFormatter = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false });
      const currentTimeString = jstFormatter.format(now); // e.g. "20:00"

      // Allow overriding target time via query or body, or test directly for a user
      const testUserId = (req.query.userId as string) || (req.body?.userId as string);
      const targetTime = (req.query.time as string) || (req.body?.time as string) || currentTimeString;
      
      console.log(`Cron triggered for time: ${targetTime}, testUserId: ${testUserId || 'none'}`);

      const db = getFirestore();
      const usersRef = db.collection('users');

      const userDocMap = new Map<string, any>();

      if (testUserId) {
        const directDoc = await usersRef.doc(testUserId).get();
        if (directDoc.exists) {
          userDocMap.set(directDoc.id, directDoc.data());
        }
      } else {
        // Find all users whose dailyReminderTime, notificationTime, or notificationPreferences.reminderTime matches targetTime
        const [snapDaily, snapNotif, snapPref] = await Promise.all([
          usersRef.where('dailyReminderTime', '==', targetTime).get(),
          usersRef.where('notificationTime', '==', targetTime).get(),
          usersRef.where('notificationPreferences.reminderTime', '==', targetTime).get(),
        ]);

        snapDaily.forEach(d => userDocMap.set(d.id, d.data()));
        snapNotif.forEach(d => userDocMap.set(d.id, d.data()));
        snapPref.forEach(d => userDocMap.set(d.id, d.data()));
      }

      if (userDocMap.size === 0) {
        return res.json({ 
          status: "ok",
          message: `No users scheduled for ${targetTime}`,
          targetTime 
        });
      }

      const userIds: string[] = [];
      userDocMap.forEach((data, id) => {
        if (data.privacy?.notifications !== false && data.privacySettings?.notifications !== false) {
          userIds.push(id);
        }
      });

      const tokens: string[] = [];
      const tokenToUidMap = new Map<string, string>();

      // Fetch tokens for these users
      for (const uid of userIds) {
        const tokenSnap = await db.collection('users').doc(uid).collection('tokens').get();
        tokenSnap.forEach(tDoc => {
          const t = tDoc.data().token;
          if (t) {
            tokens.push(t);
            tokenToUidMap.set(t, uid);
          }
        });
      }

      if (tokens.length === 0) {
        return res.json({ 
          status: "ok",
          message: `No active tokens found for scheduled users at ${targetTime}`,
          targetTime,
          scheduledUsersCount: userIds.length 
        });
      }

      const payload = {
        notification: {
          title: "養護教諭採用試験対策",
          body: "📝 今日の学習を始めましょう！",
        },
      };

      const response = await getMessaging().sendEachForMulticast({
        tokens,
        notification: {
          title: "養護教諭採用試験対策",
          body: "📝 今日の学習を始めましょう！",
        },
        webpush: {
          headers: {
            Urgency: "high",
            TTL: "86400",
          },
          notification: {
            tag: "yogo-daily-reminder",
            renotify: false,
            requireInteraction: false,
            icon: "/vite.svg",
          },
          fcmOptions: {
            link: "/",
          },
        },
      });

      console.log(`Successfully sent ${response.successCount} messages; failed ${response.failureCount}`);

      // Clean up invalid or unregistered tokens asynchronously
      if (response.failureCount > 0) {
        response.responses.forEach(async (resp, idx) => {
          if (!resp.success && resp.error) {
            const errCode = resp.error.code;
            if (
              errCode === 'messaging/registration-token-not-registered' ||
              errCode === 'messaging/invalid-registration-token'
            ) {
              const badToken = tokens[idx];
              const uid = tokenToUidMap.get(badToken);
              if (uid) {
                try {
                  await db.collection('users').doc(uid).collection('tokens').doc(badToken).delete();
                  console.log(`Cleaned up stale token for user ${uid}`);
                } catch (cleanErr) {
                  console.warn("Failed to delete stale token:", cleanErr);
                }
              }
            }
          }
        });
      }

      res.json({ 
        status: "ok",
        message: "Notifications processed",
        successCount: response.successCount,
        failureCount: response.failureCount,
        targetTime
      });
    } catch (error: any) {
      console.error("Cron notification error:", error);
      res.status(500).json({ error: error.message || "Cron notification error" });
    }
  };

  // Support both GET, POST and all route variations (/api/fcm/cron-reminders, /api/cron/send-notifications, etc.)
  app.all("/api/fcm/cron-reminders", handleCronNotifications);
  app.all("/api/cron/send-notifications", handleCronNotifications);
  app.all("/api/cron-reminders", handleCronNotifications);

  // === VITE MIDDLEWARE SETUP ===
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    
    // 静的ファイル配信時に、.js, .css, .html に対して確実に charset=utf-8 を設定し文字化けを防ぎます
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.js' || ext === '.mjs') {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        } else if (ext === '.css') {
          res.setHeader('Content-Type', 'text/css; charset=utf-8');
        } else if (ext === '.html') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
        } else if (ext === '.json') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
        }
      }
    }));

    app.get('*', (req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
