// server.js
import express from 'express';
import { config } from 'dotenv';
import OpenAI from 'openai';
import bodyParser from 'body-parser';
import axios from 'axios';

config();

const app = express();
const PORT = process.env.PORT || 3000;
app.use(bodyParser.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.post('/webhook', async (req, res) => {
  const events = req.body.events;
  if (!Array.isArray(events)) return res.sendStatus(200);

  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const userMessage = event.message.text;
      const replyToken = event.replyToken;

      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `你是一個專門為短影音內容設計標題的助手，風格傾向專業、冷靜與理性。使用者會提供影片的逐字稿，你的任務是根據該逐字稿內容產出5個具有資訊性、條理清晰、不誇張煽情的短影音標題（不需要 hashtag）。你可以依兩種命名方向操作，並根據內容靈活運用：

1. 精選句子命名法：從逐字稿中挑選一句能代表整部影片主旨、具理性或啟發性的語句，作為標題，例如：「關鍵不是努力，而是方向」，適用於思考或價值觀探討的內容。

2. 主題提煉命名法：整合逐字稿內容主旨或影片情境，創造出具清晰主旨、專業語氣的短句作為標題，例如：「如何在30歲前穩定理財」，適用於教育類或經驗分享影片。

避免使用誇張語氣、過度情緒用詞或標題黨風格。語言偏好以使用者所提供逐字稿語言為準，並保持清楚、簡潔。若逐字稿內有明顯辨識錯誤（如：年增分數），請根據上下文修正為正確的專業用詞。`
            },
            {
              role: 'user',
              content: userMessage
            }
          ],
          temperature: 0.7
        });

        const titles = completion.choices[0].message.content.trim();

        const replyText = `以下是為你產出的5個短影音標題：\n\n${titles}\n\n📌 提醒你：這些標題已經幫你完成90%的工作，但最終的那10%，還是得靠你動動腦微調一下，這樣效果才會最好！`;

        await axios.post('https://api.line.me/v2/bot/message/reply', {
          replyToken,
          messages: [{ type: 'text', text: replyText }]
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
          }
        });

      } catch (err) {
        console.error('GPT or LINE error:', err.response?.data || err.message);
      }
    }
  }
  res.sendStatus(200);
});

app.get('/', (_, res) => {
  res.send('LINE GPT 標題產生器運行中');
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
