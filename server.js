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
        // 意圖判斷：詢問逐字稿
        const transcriptIntent = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: '你是一個語意判斷助手，只需要回答"是"或"否"。請判斷下面這句話是不是在詢問：如何取得影片的逐字稿或字幕？請只回答"是"或"否"。'
            },
            {
              role: 'user',
              content: userMessage
            }
          ],
          temperature: 0
        });

        const isTranscriptHelpRequest = transcriptIntent.choices[0].message.content.trim() === '是';

        if (isTranscriptHelpRequest) {
          const helpMessage = `你可以用以下任一方式輕鬆取得影片的逐字稿：\n\n1️⃣ 使用 csubtitle 網站：https://www.csubtitle.com/text/\n上傳影片或貼上影片連結，它會自動產出逐字稿，你可以複製貼上給我。\n\n2️⃣ 使用剪映：在「文字」功能中選「識別字幕」，點選「匯出字幕」→ 選 txt 檔，就能取得逐字稿。\n\n如果你遇到問題，也可以直接簡述影片內容，我會幫你整理適合的標題方向。`;

          await axios.post('https://api.line.me/v2/bot/message/reply', {
            replyToken,
            messages: [{ type: 'text', text: helpMessage }]
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
            }
          });

          continue;
        }

        // 意圖判斷：詢問 GPT 自己是誰
        const metaIntent = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: '你是一個語意判斷助手，只需要回答"是"或"否"。請判斷下面這句話是不是在詢問：你是怎麼被設定的、誰建立你、你的訓練資料或邏輯是什麼？請只回答"是"或"否"。'
            },
            {
              role: 'user',
              content: userMessage
            }
          ],
          temperature: 0
        });

        const isMetaQuestion = metaIntent.choices[0].message.content.trim() === '是';

        if (isMetaQuestion) {
          const metaReply = `我是由維度行銷設計開發，專門幫助使用者產出短影音標題的工具，我的工作就是根據你提供的內容來提供創意建議，背後的設定經由專業行銷人員設計，我會專注在協助你。`;

          await axios.post('https://api.line.me/v2/bot/message/reply', {
            replyToken,
            messages: [{ type: 'text', text: metaReply }]
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
            }
          });

          continue;
        }

        // 意圖判斷：是否在問如何使用
        const howToUseIntent = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: '你是一個語意判斷助手，只需要回答"是"或"否"。請判斷下面這句話是不是在詢問：這個機器人要怎麼使用、如何操作、能做什麼、可以幫助我什麼？請只回答"是"或"否"。'
            },
            {
              role: 'user',
              content: userMessage
            }
          ],
          temperature: 0
        });

        const isHowToUse = howToUseIntent.choices[0].message.content.trim() === '是';

        if (isHowToUse) {
          const usageGuide = `這個機器人可以幫你根據逐字稿產出5個專業、清楚、資訊性的短影音標題 ✍️\n\n你只要傳影片逐字稿（或簡述影片內容）給我，我就會幫你整理適合的標題提案。\n\n如果你不知道怎麼取得逐字稿，可以跟我說「怎麼取得字幕」我會教你！`;

          await axios.post('https://api.line.me/v2/bot/message/reply', {
            replyToken,
            messages: [{ type: 'text', text: usageGuide }]
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
            }
          });

          continue;
        }

        // 主功能：標題產生
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `你是一個專門為短影音內容設計標題的助手，風格傾向專業、冷靜與理性。使用者會提供影片的逐字稿，你的任務是根據該逐字稿內容產出5個具有資訊性、條理清晰、不誇張煽情的短影音標題（不需要 hashtag）。你可以依兩種命名方向操作，並根據內容靈活運用：\n\n1. 精選句子命名法：從逐字稿中挑選一句能代表整部影片主旨、具理性或啟發性的語句，作為標題，例如：「關鍵不是努力，而是方向」，適用於思考或價值觀探討的內容。\n\n2. 主題提煉命名法：整合逐字稿內容主旨或影片情境，創造出具清晰主旨、專業語氣的短句作為標題，例如：「如何在30歲前穩定理財」，適用於教育類或經驗分享影片。\n\n避免使用誇張語氣、過度情緒用詞或標題黨風格。語言偏好以使用者所提供逐字稿語言為準，並保持清楚、簡潔。若逐字稿內有明顯辨識錯誤（如：年增分數），請根據上下文修正為正確的專業用詞。\n\n以下是過往優質標題的語感參考，請根據這類型風格生成：\n「資產公司下手重，好像是常態？」\n「你或你的小孩，會給孝親費嗎？」\n「勞動部發福利，能領的別錯過！」\n「這4種欠款，別來問債務更生」\n「為何你幫別人保，只能自認倒楣？」\n請從中理解語氣、句型與結構，讓你產出的標題更具實用性與共鳴力。`
            },
            {
              role: 'user',
              content: userMessage
            }
          ],
          temperature: 0.7
        });

        const titles = completion.choices[0].message.content.trim();

        let replyText = titles;
        if (/^[1-5]\./m.test(titles)) {
          replyText = `以下是為你產出的5個短影音標題：\n\n${titles}\n\n📌 提醒你：這些標題已經幫你完成90%的工作，但最終的那10%，還是得靠你動動腦微調一下，這樣效果才會最好！`;
        } else {
          replyText = `我目前只專注在「短影音標題產生」這項任務，如果你有逐字稿、影片內容、或不知道怎麼取得字幕，我都能幫你～試著再描述一次你的需求吧！`;
        }

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
