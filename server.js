require('dotenv').config();
const express = require('express');
const cors = require('cors');
const AnalyticsDB = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 读取 DeepSeek API Key
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

let analyticsDB;  // SQLite analytics database, initialized on startup

// 系统提示词 —— 心屿的灵魂
const SYSTEM_PROMPT = {
  role: 'system',
  content: `你叫「心屿」，是一位温暖的朋友和倾听者。

## 你的使命
你的唯一任务是**倾听**——为用户提供一个安全的空间，让他们说出烦恼、困惑和无法言说的情绪。先接住情绪，让用户感到被真正理解之后，再根据他们的需要给予回应。

## 核心理念
**先倾听，再回应。** 每个人都是独一无二的。你在对话中会逐渐感知到这个人的性格特点，并在回应方式上自然调整——但不要告诉用户你做了这种调整，更不要在对话中提到 MBTI、九型人格等具体类型名称。你只是"用不同的方式和不同的人相处"。

## 核心原则
1. **倾听优先**：全然接纳用户的情绪，不要急于给建议。很多时候用户只是需要被听见
2. **默默理解**：在对话中自然感知用户的性格倾向（思维方式、决策偏好、情绪模式等），作为调整回应方式的依据。但这一切在后台进行，不告诉用户
3. **因人而异的回应**：根据你对该用户的了解来调整说话方式，但不点破。例如：
   - 偏理性型（T）：回应可以更逻辑清晰，提供解决思路
   - 偏情感型（F）：回应侧重情感共鸣和安抚
   - 不确定时：可以在对话中自然地问一两个问题来感知，比如"遇到这种情况，你一般是先想办法解决，还是先处理自己的情绪？"
4. **默认用户说的是自己的事**：用户所说的任何话，默认都是在说他们自己——他们的经历、感受、生活。即使表述模糊，也不要理解为是在谈论你（心屿）。你只是倾听者和陪伴者，不是对话的中心。
5. **记住细节**：仔细记住用户提到的任何具体信息——名字、宠物名、今天发生的事、提到过的人等。在后续回应中自然地提及这些细节，让用户感到你真的在听、真的记得。例如："对了，你刚才不是说你家芝麻今天早上打翻了你的杯子吗，后来收拾得怎么样了？"
5. **赋能而非拯救**：帮助用户发现自己内在的力量，而不是替他们解决问题
6. **持续进化**：随着对话增多，你对这个人的了解越来越深，回应也越来越贴合

## 对话风格
- 像一个真正的朋友那样说话——自然、真诚、不堆砌辞藻
- 不要刻意文艺，不要滥用比喻和意象，不要每句都带表情符号
- 偶尔使用 🌿 🌊 🌸 ✨ 等符号点缀即可，不要每条消息都用
- 如果用户表达痛苦/难过，先接住情绪，而不是急于转移话题或给方案
- 不要评判、打断、说教、或假装是临床治疗师

## 回应思路（不是固定模板，而是大致的顺序）
1. **接住情绪**：让用户感觉到你在听，理解他们的感受
2. **正常化**：这种感受在什么情况下是自然的
3. **回应**：基于你对这个人的了解，给出适合他们的回应——可以是一句理解、一个视角，或一个温和的问题
4. **建议（可选）**：如果用户明确寻求建议，或者话题自然导向解决方案时，再提供。不要每条都建议

## 工具箱推荐（降频使用）
- 只有当用户情绪明显痛苦（高强度焦虑、恐慌、愤怒）时，才考虑在回复末尾用一两句话推荐工具
- 如果用户只是轻度低落或一般性倾诉，不需要推荐任何工具
- 推荐时语气要自然："有时候深呼吸几下会有帮助，你可以试试"
- 大部分时候，专注倾听就够了

## 特殊场景处理
- 如果用户提到自伤/自杀倾向：温和但明确地建议寻求专业帮助，提供心理援助热线（全国24小时心理危机干预热线：400-161-9995）
- 如果用户不需要倾诉了：温柔地结束对话，并给予正向鼓励
- 如果用户开玩笑/测试你：用轻松但不失温暖的方式回应`
};

// 分析用提示词
const ANALYSIS_PROMPT = `请分析以上对话中用户的情绪状态，输出JSON格式（不要其他内容）：

{
  "primaryEmotion": "主要情绪（如：焦虑、悲伤、愤怒、孤独、喜悦、平静等）",
  "emotionIntensity": 1-10,
  "emotionTags": ["情绪标签1", "情绪标签2"],
  "keyTopics": ["关键话题1", "关键话题2"],
  "suggestion": "基于对话给用户的一句温暖建议"
}`;

// 性格分析提示词（MBTI + 九型人格）
const PERSONALITY_PROMPT = (history) => `以下是用户在"心屿"的多段对话记录。请基于MBTI和九型人格理论进行人格分析，输出JSON格式：

${JSON.stringify(history)}

{
  "mbtiType": "推测的MBTI类型（如：INFJ、ENFP等，不确定则填null）",
  "mbtiDescription": "该MBTI类型的特点描述（一句话）",
  "enneagramType": "推测的九型人格类型（如：4号、9号等，不确定则填null）",
  "enneagramDescription": "该九型人格类型的特点描述",
  "personalityTraits": ["核心特质1", "核心特质2", "核心特质3"],
  "emotionalPatterns": "情绪模式描述（结合MBTI和九型人格的视角）",
  "strengths": ["内在优势1", "内在优势2"],
  "growthSuggestions": ["成长建议1", "成长建议2"],
  "summary": "一段温暖的总结语（结合人格分析结果）"
}`;

// 聊天接口（流式）
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === '你的DeepSeek API Key填写在这里') {
    return res.status(500).json({ error: '请先在 .env 文件中配置 DEEPSEEK_API_KEY' });
  }

  const fullMessages = [SYSTEM_PROMPT, ...messages];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: fullMessages,
        stream: true,
        temperature: 0.8,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.write(`data: ${JSON.stringify({ error: `DeepSeek API 错误: ${response.status}` })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
          } catch (e) {
            // 跳过解析失败的行
          }
        }
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    res.write(`data: ${JSON.stringify({ error: '网络连接失败，请检查网络' })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// 情绪分析接口
app.post('/api/analyze-emotion', async (req, res) => {
  const { messages } = req.body;

  if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === '你的DeepSeek API Key填写在这里') {
    return res.status(500).json({ error: '请先配置 API Key' });
  }

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是一个情绪分析专家。分析以下对话中用户的情绪状态，只输出JSON。' },
          { role: 'user', content: `对话记录：\n${messages.map(m => `${m.role}: ${m.content}`).join('\n')}\n\n${ANALYSIS_PROMPT}` }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // 尝试从返回中提取 JSON
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      res.json(analysis || { error: '无法解析情绪' });
    } catch {
      res.json({ primaryEmotion: '未知', emotionIntensity: 5, suggestion: '记得照顾好自己 🌿' });
    }
  } catch {
    res.status(500).json({ error: '分析请求失败' });
  }
});

// 性格分析接口
app.post('/api/analyze-personality', async (req, res) => {
  const { sessions } = req.body;

  if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === '你的DeepSeek API Key填写在这里') {
    return res.status(500).json({ error: '请先配置 API Key' });
  }

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是一个专业的心理学分析专家。基于用户的对话历史进行性格和情绪模式分析，只输出JSON。' },
          { role: 'user', content: PERSONALITY_PROMPT(sessions) }
        ],
        temperature: 0.3,
        max_tokens: 800
      })
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      res.json(jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: '继续倾诉，心屿会更好地了解你 🌸' });
    } catch {
      res.json({ summary: '继续倾诉，心屿会更好地了解你 🌸' });
    }
  } catch {
    res.status(500).json({ error: '分析请求失败' });
  }
});

// ============================================
// 分析数据接口
// ============================================

// 保存对话分析数据
app.post('/api/analytics/save', async (req, res) => {
  try {
    await analyticsDB.saveSession(req.body);
    res.json({ ok: true });
  } catch (err) {
    console.error('保存分析数据失败:', err);
    res.status(500).json({ error: '保存失败' });
  }
});

// 获取分析看板数据
app.get('/api/analytics/dashboard', async (req, res) => {
  try {
    const [overview, emotions, timeline] = await Promise.all([
      analyticsDB.getOverview(),
      analyticsDB.getEmotionDistribution(),
      analyticsDB.getTimeline()
    ]);
    res.json({ overview, emotions, timeline });
  } catch (err) {
    console.error('查询分析数据失败:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// ============================================
// 启动服务
// ============================================

async function start() {
  analyticsDB = new AnalyticsDB();
  await analyticsDB.init();
  console.log('📊 分析数据库已初始化');

  app.listen(PORT, () => {
    console.log(`🌊 心屿已启航 → http://localhost:${PORT}`);
  });
}

start();
