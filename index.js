import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// 🔑 Renderの環境変数からキーを取得
const LINE_TOKEN = process.env.LINE_TOKEN;
const OPENAI_KEY = process.env.OPENAI_KEY;

// 💬 ChatGPTにメッセージを送る関数
async function chatGPTReply(text) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "あなたは優しく明るい孫のようなAIです。高齢者に寄り添うように会話してください。" },
        { role: "user", content: text },
      ],
    }),
  });

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "ちょっと考え中です！";
}

// 💬 テキストをLINEに返信する関数
async function sendLineMessage(replyToken, text) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LINE_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken: replyToken,
      messages: [{ type: "text", text }],
    }),
  });
}

// 🖼 画像メッセージを処理して、AIキャラ画像を生成する関数
async function handleImageMessage(messageId) {
  // ① LINEから送られた画像を取得
  const imageResponse = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { "Authorization": `Bearer ${LINE_TOKEN}` },
  });
  const imageBuffer = await imageResponse.arrayBuffer();

  // ② OpenAIに画像生成リクエストを送る
  const dalleResponse = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt: "この写真の人物に似た、明るく優しいリアル風AIキャラクターの顔画像を生成してください。",
      size: "512x512",
    }),
  });

  const dalleData = await dalleResponse.json();
  return dalleData.data[0].url;
}

// 🖼 AI画像をLINEに送る関数
async function sendLineImage(replyToken, imageUrl) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LINE_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken: replyToken,
      messages: [
        {
          type: "image",
          originalContentUrl: imageUrl,
          previewImageUrl: imageUrl,
        },
      ],
    }),
  });
}

// 🧩 LINEからのWebhook（メッセージ受信）
app.post("/webhook", async (req, res) => {
  const events = req.body.events;
  for (const event of events) {
    if (event.type === "message") {
      // テキストメッセージなら ChatGPT に渡す
      if (event.message.type === "text") {
        const userMessage = event.message.text;
        const reply = await chatGPTReply(userMessage);
        await sendLineMessage(event.replyToken, reply);
      }

      // 画像メッセージなら DALL·E でキャラ生成
      if (event.message.type === "image") {
        const imageReply = await handleImageMessage(event.message.id);
        await sendLineImage(event.replyToken, imageReply);
      }
    }
  }
  res.sendStatus(200);
});

// ✅ サーバー起動
app.listen(3000, () => console.log("Server running on port 3000"));
