import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const LINE_TOKEN = process.env.LINE_TOKEN;
const OPENAI_KEY = process.env.OPENAI_KEY;

// サーバー起動中だけ保持する簡易ユーザーDB
const userNames = {};

// ChatGPTにテキスト送信
async function chatGPTReply(text, userName) {
  const prompt = userName
    ? `あなたは優しい孫AIです。相手の名前は「${userName}」です。名前を呼びながら親しみを持って会話してください。「おじいちゃん」「おばあちゃん」とは言わないでください。ユーザーの質問には必ず返答してください。薬や健康の相談もわかりやすく丁寧に答えてください。`
    : "あなたは優しい孫AIです。高齢者に寄り添うように会話してください。名前を呼ぶときは「おじいちゃん」「おばあちゃん」とは言わず、登録されている名前で呼んでください。";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: text },
      ],
    }),
  });

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "ちょっと考え中です！";
}

// LINEにテキスト返信
async function sendLineMessage(replyToken, text) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LINE_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }],
    }),
  });
}

// 画像受信 → AIキャラ生成
async function handleImageMessage(messageId) {
  const imageResponse = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { "Authorization": `Bearer ${LINE_TOKEN}` },
  });
  const imageBuffer = await imageResponse.arrayBuffer();

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

// LINEに画像返信
async function sendLineImage(replyToken, imageUrl) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LINE_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
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

// Webhook
app.post("/webhook", async (req, res) => {
  const events = req.body.events;
  for (const event of events) {
    if (event.type === "message") {
      const userId = event.source.userId;

      // 画像メッセージ処理
      if (event.message.type === "image") {
        const imageReply = await handleImageMessage(event.message.id);
        await sendLineImage(event.replyToken, imageReply);
        continue; // 画像処理後はテキスト処理に行かない
      }

      const userMessage = event.message.text;

      // 名前未登録の場合
      if (!userNames[userId]) {
        // 名前っぽい入力なら登録してすぐ返答
        if (userMessage && userMessage.length <= 10 && !userMessage.includes(" ")) {
          userNames[userId] = userMessage.trim();
          await sendLineMessage(event.replyToken, `ありがとうございます、${userNames[userId]}さん😊 これからよろしくね！`);

          // 名前登録直後もChatGPTで返答
          const reply = await chatGPTReply(userMessage, userNames[userId]);
          await sendLineMessage(event.replyToken, reply);
        } else {
          // 名前が未登録でまだ入力が名前じゃない場合
          await sendLineMessage(event.replyToken, "こんにちは！あなたのお名前を教えてください☺️");
        }
      } else {
        // 名前登録済み → ChatGPTで通常会話
        const reply = await chatGPTReply(userMessage, userNames[userId]);
        await sendLineMessage(event.replyToken, reply);
      }
    }
  }
  res.sendStatus(200);
});

// サーバー起動
app.listen(3000, () => console.log("Server running on port 3000"));
