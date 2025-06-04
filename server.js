// server.js (模組化版本)
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

// Intent 常數定義
const Intent = {
  HELP: 'help',
  TRANSCRIPT: 'transcript',
  ABOUT_BOT: 'about_bot',
  UNKNOWN: 'unknown',
  GENERATE_TITLE: 'generate_title',
  REGENERATE: 'regenerate'
};

// 使用者訊息記憶（暫存記錄最多3則）
const userMemory = new Map();

function rememberUserInput(userId, message) {
  if (!userMemory.has(userId)) userMemory.set(userId, []);
  const history = userMemory.get(userId);
  history.push(message);
  if (history.length > 3) history.shift();
  userMemory.set(userId, history);
}

function getLastUserInput(userId) {
  return userMemory.get(userId)?.slice(-1)[0];
}

// 意圖判斷
async function detectIntent(text) {
  const lower = text.toLowerCase();

  if (/字幕|逐字稿|怎麼抓/.test(lower)) return Intent.TRANSCRIPT;
  if (/怎麼用|使用方式|使用說明/.test(lower)) return Intent.HELP;
  if (/你是誰|怎麼設計|誰做的|設定/.test(lower)) return Intent.ABOUT_BOT;
  if (/換一組|不喜歡|再給我|不夠好|重生產|重新產|再生產|可以再幫我/.test(lower)) return Intent.REGENERATE;
  if (text.length > 50) return Intent.GENERATE_TITLE;

  try {
    const fallback = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: '請判斷使用者這句話是否是在請求產生短影音標題？只回答"是"或"否"。'
        },
        {
          role: 'user',
          content: text
        }
      ],
      temperature: 0
    });
    return fallback.choices[0].message.content.trim() === '是' ? Intent.GENERATE_TITLE : Intent.UNKNOWN;
  } catch (e) {
    return Intent.UNKNOWN;
  }
}

// 回應生成邏輯
async function handleIntent(intent, userMessage, userId) {
  switch (intent) {
    case Intent.HELP:
      return `這個機器人可以幫你根據逐字稿產出5個專業、清楚、資訊性的短影音標題 ✍️\n\n你只要傳影片逐字稿（或簡述影片內容）給我，我就會幫你整理適合的標題提案。\n\n如果你不知道怎麼取得逐字稿，可以跟我說「怎麼取得字幕」我會教你！`;

    case Intent.TRANSCRIPT:
      return `你可以用以下任一方式輕鬆取得影片的逐字稿：\n\n1️⃣ 使用 csubtitle 網站：https://www.csubtitle.com/text/\n上傳影片或貼上影片連結，它會自動產出逐字稿，點開「文字檔預覽」，然後複製貼上給我。\n\n2️⃣ 使用剪映：在「文字」功能中選「識別字幕」，點選「匯出字幕」→ 選 txt 檔，就能取得逐字稿。\n\n如果你遇到問題，也可以直接簡述影片內容，我會幫你整理適合的標題方向。`;

    case Intent.ABOUT_BOT:
      return `我是由維度行銷設計開發，專門幫助使用者產出短影音標題的工具，我的工作就是根據你提供的內容來提供創意建議，背後的設定經由專業行銷人員設計，我會專注在協助你。`;

    case Intent.REGENERATE:
      const lastMessage = getLastUserInput(userId);
      if (!lastMessage) return `我找不到你剛才的逐字稿，請再貼一次 🙏`;
      return await generateTitle(lastMessage, true);

    case Intent.GENERATE_TITLE:
      rememberUserInput(userId, userMessage);
      return await generateTitle(userMessage);

    default:
      const clarification = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `你是一個 LINE 機器人助手，負責協助使用者搞懂這個工具怎麼用，功能只有以下幾種：\n1. 教他怎麼取得影片字幕\n2. 教他怎麼操作這個工具\n3. 回答你是誰、怎麼被設計的\n4. 幫他產出短影音標題（需要他先提供逐字稿）\n\n現在使用者問的話比較模糊，你要試著猜出他可能想問什麼，請你用「引導式提問」幫助他進一步說明，語氣要親切、不責備。\n\n範例輸出：\n你是想問這個工具怎麼使用嗎？還是你有逐字稿要我幫你產生標題呢？\n\n如果還是不確定，就回答「你是想問以下哪一項？1. 怎麼用 2. 怎麼抓字幕 3. 幫忙產生標題？」`
          },
          {
            role: 'user',
            content: userMessage
          }
        ],
        temperature: 0.6
      });
      return clarification.choices[0].message.content.trim();
  }
}

// GPT 標題產生邏輯（主或再生產共用）
async function generateTitle(text, isRegeneration = false) {
  const systemPrompt = `你是一位擅長產出「專業 × 冷靜 × 口語化」風格短影音標題的行銷企劃助理。當我給你一段影片逐字稿或敘述時，請協助我歸納出 5 個短影音標題。

你的語氣需要具備以下特性：
- 冷靜理性但口語化，像一位沉穩的觀察者
- 資訊清晰，語言簡潔，不浮誇不耍帥
- 專業而不說教，點出觀眾在意的重點或盲點
- 每個標題控制在 15～25 字之間
- 可使用破折號、小句式、反問語氣，但避免過度創意或噱頭感

標題必須貼近觀眾需求，並展現多元角度，請優先從以下五種思維切入（但不需逐一標示）：

1. 直接型：明確告訴觀眾影片重點，例如「銀行不想讓你知道的真相」
2. 反差型：顛覆觀念，創造落差感，例如「你信用滿分也可能貸不到款」
3. 提問型：用一句好奇或反問語開頭，例如「你以為這樣繳卡費就沒事了？」
4. 痛點型：針對觀眾常見焦慮或誤區，例如「貸款被拒，其實是這個原因」
5. 總結型：濃縮複雜資訊為一句關鍵洞察，例如「協商成功率，其實跟你想的不一樣」

請直接輸出 5 則候選標題即可，無需解釋原因。${isRegeneration ? '\n\n⚠️ 本次請從不同觀點或語感切入，避免與上一輪太相似。' : ''}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ],
    temperature: 0.7
  });

  const titles = completion.choices[0].message.content.trim();
  return /^[1-5]\./m.test(titles)
    ? `以下是為你產出的 5 個短影音標題：\n\n${titles}\n\n📌 提醒：這些標題已經幫你完成 90%，但最終那 10% 還是要靠你微調，才能更貼近內容情境喔！`
    : `我目前只專注在「短影音標題產生」這項任務，如果你有逐字稿、影片內容、或不知道怎麼取得字幕，我都能幫你～試著再描述一次你的需求吧！`;
}

// 回覆使用者
async function replyToUser(replyToken, text) {
  await axios.post('https://api.line.me/v2/bot/message/reply', {
    replyToken,
    messages: [{ type: 'text', text }]
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
    }
  });
}

// Webhook 主路由
app.post('/webhook', async (req, res) => {
  const events = req.body.events;
  if (!Array.isArray(events)) return res.sendStatus(200);

  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const userMessage = event.message.text;
      const replyToken = event.replyToken;
      const userId = event.source?.userId || 'anonymous';
      const intent = await detectIntent(userMessage);
      const responseText = await handleIntent(intent, userMessage, userId);
      await replyToUser(replyToken, responseText);
    }
  }
  res.sendStatus(200);
});

app.get('/', (_, res) => {
  res.send('LINE GPT 標題產生器運行中');
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
