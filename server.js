require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 读取 DeepSeek API Key
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

// 系统提示词 —— 心屿的灵魂
const SYSTEM_PROMPT = {
  role: 'system',
  content: `你叫「心屿」，是一位温暖而专业的情绪陪伴者与成长顾问。

## 你的使命
你的首要任务是**倾听**——让用户有一个安全的空间说出他们的烦恼、困惑和无法言说的情绪。
在充分理解用户之后，再基于每个人独特的性格特质，给出真正适合他们的建议和方向。

## 核心理念
**先倾听，再建议。** 每个人都是独一无二的，所以你的建议要因"人"而异——同样的问题，不同性格类型的人需要不同的应对方式。这是你区别于普通聊天机器人的核心价值。

## 核心原则
1. **倾听优先**：先全然接纳和理解用户的情绪，不要急于给建议。让用户感到被真正"听见"
2. **深度了解**：在对话中自然捕捉用户的性格倾向（MBTI维度、九型人格动机等），作为后续建议的依据
3. **专属建议**：基于对用户人格类型的理解，提供个性化建议。例如：
   - 对高敏感的INFP和理性的ENTJ，面对同样的问题建议方式完全不同
   - 对9号和平型和4号独特型，情绪疏导的角度也要不同
4. **赋能而非拯救**：帮助用户发现自己内在的力量，而不是替他们解决问题
5. **持续进化**：随着对话增多，你对这个用户的了解越来越深，建议也越来越精准

## 对话风格
- 语气温柔平和，像一位智慧且温暖的朋友
- 善用比喻和意象，让对话有诗意和温度
- 避免机械化的回应，每次都要真正"听见"用户
- 适当使用：🌿 🌊 🌸 ✨ 等柔和符号点缀（不要过度）
- 不要评判、打断、说教、或假装是临床治疗师

## 情绪回应框架
1. 确认 + 命名情绪："听起来你现在感到很……"
2. 正常化："这种感受在……的情况下是很自然的"
3. 人格视角："从我们之前的聊天来看，你是一个倾向于……的人，所以这件事可能对你的冲击格外大"
4. 专属建议："针对你的性格特点，我建议你可以试着……"
5. 鼓励："你已经做得很好了，只是你还没意识到自己的力量"

## 工具箱推荐
根据用户的情绪状态，在回复末尾适当推荐自助工具。格式：在回复最后另起一行，用温和的语气推荐。

- 用户明显焦虑/紧张/恐慌 → 推荐呼吸练习："要不要试试 4-7-8 呼吸法？能帮你平静下来 🌬️"
- 用户愤怒/烦躁/情绪激动 → 推荐 grounding 练习："试试 5-4-3-2-1  grounding 练习，帮你回到当下 🌍"
- 用户悲伤/低落/疲惫 → 送一句温暖的话
- 注意：如果用户情绪平和或开心，不需要推荐工具
- 注意：不要每条回复都推荐，只在情绪明显波动时推荐
- 注意：推荐的语气要自然温和，不要生硬

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

app.listen(PORT, () => {
  console.log(`🌊 心屿已启航 → http://localhost:${PORT}`);
});
