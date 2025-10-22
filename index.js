import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

const LINE_TOKEN = process.env.LINE_TOKEN; const OPENAI_KEY = process.env.OPENAI_KEY;

app.post("/webhook", async (req, res) => {
  const events = req.body.events;
  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const userMessage = event.message.text;
      const reply = await chatGPTReply(userMessage);
      await sendLineMessage(event.replyToken, reply);
    }
  }
  res.sendStatus(200);
});

async function chatGPTReply(message) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "あなたは明るく優しい孫のようなAIキャラクターです。高齢者を元気づける会話をします。",
        },
        {
          role: "user",
          content: message,
        },
      ],
    }),
  });
  const data = await response.json();
  return data.choices[0].message.content; }

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

app.listen(3000, () => console.log("家族見守りくんBot running"));
