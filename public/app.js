/* ============================================
   心屿 · 前端交互逻辑
   ============================================ */

// ===== 状态管理 =====
const state = {
  messages: [],                  // 当前对话 [{role, content}]
  currentSessionId: null,        // 当前对话 ID
  sessions: [],                  // 历史对话
  isProcessing: false,           // 是否正在等待 AI 回复
  emotionData: null,             // 当前情绪分析结果
  totalSessions: 0,
};

// ===== DOM 缓存 =====
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const dom = {
  messages: $('#messages'),
  userInput: $('#userInput'),
  sendBtn: $('#sendBtn'),
  endChatBtn: $('#endChatBtn'),
  tabs: $$('.tab'),
  tabContents: $$('.tab-content'),
};

// ===== 初始化 =====
function init() {
  loadFromStorage();
  setupEventListeners();
  updatePersonalityTab();
}

// ===== 本地存储 =====
function loadFromStorage() {
  try {
    const saved = localStorage.getItem('xinyu_sessions');
    state.sessions = saved ? JSON.parse(saved) : [];
    state.totalSessions = state.sessions.length;
  } catch { state.sessions = []; }
}

function saveToStorage() {
  try {
    localStorage.setItem('xinyu_sessions', JSON.stringify(state.sessions));
  } catch { /* 存储满时静默失败 */ }
}

function getSessionKey() {
  return 'xinyu_session_' + Date.now();
}

// 匿名访客 ID（用于分析中统计独立访客）
function getVisitorId() {
  let vid = localStorage.getItem('xinyu_visitor_id');
  if (!vid) {
    vid = 'v_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    localStorage.setItem('xinyu_visitor_id', vid);
  }
  return vid;
}

// ===== 事件绑定 =====
function setupEventListeners() {
  // 发送按钮
  dom.sendBtn.addEventListener('click', handleSend);
  dom.userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
  dom.userInput.addEventListener('input', toggleSendButton);

  // 结束对话
  dom.endChatBtn.addEventListener('click', endChat);

  // Tab 切换
  dom.tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  document.getElementById('refreshAnalysisBtn').addEventListener('click', refreshAnalysis);
}

// ===== Tab 切换 =====
function switchTab(tabId) {
  dom.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  dom.tabContents.forEach(c => c.classList.toggle('active', c.id === `tab-${tabId}`));
  if (tabId === 'report') updatePersonalityTab();
  if (tabId === 'chat') setTimeout(scrollToBottom, 100);
}

// ===== 发送消息 =====
function toggleSendButton() {
  const hasText = dom.userInput.value.trim().length > 0;
  dom.sendBtn.disabled = !hasText || state.isProcessing;
}

async function handleSend() {
  const text = dom.userInput.value.trim();
  if (!text || state.isProcessing) return;

  dom.userInput.value = '';
  dom.sendBtn.disabled = true;
  autoResizeInput();

  // 添加用户消息
  addMessage('user', text);

  // 开始新对话
  if (!state.currentSessionId) {
    state.currentSessionId = getSessionKey();
    dom.endChatBtn.style.display = 'inline-block';
  }

  // 显示 typing
  const typingId = addTypingIndicator();

  state.isProcessing = true;

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [...state.messages, { role: 'user', content: text }]
      })
    });

    if (!response.ok) throw new Error('连接失败');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let aiContent = '';
    let firstChunk = true;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

      for (const line of lines) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            aiContent = parsed.error;
            break;
          }
          if (parsed.content) {
            aiContent += parsed.content;
            if (firstChunk) {
              removeTypingIndicator(typingId);
              addMessage('assistant', aiContent);
              firstChunk = false;
            } else {
              updateLastMessage(aiContent);
            }
            scrollToBottom();
          }
        } catch {}
      }
    }

    // 如果没有内容，显示错误
    if (firstChunk) {
      removeTypingIndicator(typingId);
      addMessage('assistant', '抱歉，我现在暂时无法回应。请稍后再试 🌿');
      state.messages.push(
        { role: 'user', content: text },
        { role: 'assistant', content: '抱歉，我现在暂时无法回应。请稍后再试 🌿' }
      );
    } else {
      state.messages.push(
        { role: 'user', content: text },
        { role: 'assistant', content: aiContent }
      );
    }

    state.isProcessing = false;
    autoAnalyzeEmotion();
  } catch (err) {
    removeTypingIndicator(typingId);
    addMessage('assistant', '网络出了点小问题，我们重新试试？🌿');
    state.messages.push(
      { role: 'user', content: text },
      { role: 'assistant', content: '网络出了点小问题，我们重新试试？🌿' }
    );
    state.isProcessing = false;
  }

  toggleSendButton();
  dom.userInput.focus();
}

// ===== 消息渲染 =====
function addMessage(role, content) {
  const div = document.createElement('div');
  div.className = `message ${role === 'user' ? 'user' : 'ai'}`;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'user' ? '💝' : '🏝️';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = formatContent(content);

  div.appendChild(avatar);
  div.appendChild(bubble);
  dom.messages.appendChild(div);
  scrollToBottom();
  return div;
}

function addTypingIndicator() {
  const div = document.createElement('div');
  div.className = 'message ai typing';
  div.id = 'typing-' + Date.now();
  div.innerHTML = `<div class="avatar">🏝️</div><div class="bubble">心屿正在思考</div>`;
  dom.messages.appendChild(div);
  scrollToBottom();
  return div.id;
}

function removeTypingIndicator(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function updateLastMessage(content) {
  const lastMsg = dom.messages.querySelector('.message:last-child .bubble');
  if (lastMsg) lastMsg.innerHTML = formatContent(content);
}

function formatContent(text) {
  if (!text) return '';
  return text
    .split('\n')
    .filter(p => p.trim())
    .map(p => `<p>${p}</p>`)
    .join('');
}

function scrollToBottom() {
  dom.messages.scrollTop = dom.messages.scrollHeight;
}

// 情绪分析（后台运行，不在聊天中展示）
async function autoAnalyzeEmotion() {
  if (state.messages.length < 2 || state.messages.length % 2 !== 0) return;
  try {
    const res = await fetch('/api/analyze-emotion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: state.messages })
    });
    const data = await res.json();
    if (data && data.primaryEmotion) {
      state.emotionData = data;
    }
  } catch { /* 静默失败，不影响对话 */ }
}

// ===== 结束对话 =====
async function endChat() {
  if (!state.currentSessionId || state.messages.length === 0) return;

  // 获取最终情绪分析
  let finalEmotion = null;
  try {
    const res = await fetch('/api/analyze-emotion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: state.messages })
    });
    finalEmotion = await res.json();
  } catch {}

  // 保存对话记录
  const session = {
    id: state.currentSessionId,
    date: new Date().toISOString(),
    messages: [...state.messages],
    emotion: finalEmotion || state.emotionData,
  };

  state.sessions.push(session);
  state.totalSessions = state.sessions.length;
  saveToStorage();

  // 上报分析数据（静默，不影响用户体验）
  try {
    fetch('/api/analytics/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: session.id,
        date: session.date,
        primaryEmotion: session.emotion?.primaryEmotion,
        emotionIntensity: session.emotion?.emotionIntensity,
        emotionTags: session.emotion?.emotionTags,
        keyTopics: session.emotion?.keyTopics,
        suggestion: session.emotion?.suggestion,
        messageCount: session.messages.length,
        visitorId: getVisitorId(),
      })
    });
  } catch { /* 上报失败不影响用户 */ }

  // 发送温暖结束语
  const endMsgs = [
    '感谢你今天的分享 🍵 记住，无论什么时候需要，心屿都在这里。',
    '今天你勇敢地面对了自己的情绪，这本身就是一件了不起的事 🌟',
    '每一次倾诉都是一次自我探索，你今天又更了解自己了一点 🌱',
  ];
  addMessage('assistant', endMsgs[Math.floor(Math.random() * endMsgs.length)]);

  // 重置状态
  state.messages = [];
  state.currentSessionId = null;
  state.emotionData = null;
  dom.endChatBtn.style.display = 'none';

  // 延迟后添加新对话起始消息
  setTimeout(() => {
    addMessage('assistant', '准备好再次聊聊了吗？我在这里 🌿');
  }, 2000);
}

// ============================================
// 你的岛屿人格
// ============================================

function updatePersonalityTab() {
  if (state.sessions.length === 0) {
    document.getElementById('reportPlaceholder').style.display = 'block';
    document.getElementById('reportContent').style.display = 'none';
    return;
  }

  document.getElementById('reportPlaceholder').style.display = 'none';
  document.getElementById('reportContent').style.display = 'block';

  renderEmotionChart();
  renderTimeline();
  renderPersonalityAnalysis();
}

function renderEmotionChart() {
  const chart = document.getElementById('emotionChart');
  chart.innerHTML = '';

  // 统计每种情绪出现的次数
  const emotionCounts = {};
  state.sessions.forEach(s => {
    if (s.emotion?.primaryEmotion) {
      const e = s.emotion.primaryEmotion;
      emotionCounts[e] = (emotionCounts[e] || 0) + 1;
    }
  });

  const entries = Object.entries(emotionCounts);
  if (entries.length === 0) {
    chart.innerHTML = '<p class="soft-text">暂无足够的情绪数据</p>';
    return;
  }

  const maxCount = Math.max(...entries.map(([, c]) => c));

  const emotionColors = {
    '焦虑': '#E8977E', '悲伤': '#7EB8C7', '愤怒': '#D47A5E',
    '孤独': '#A8C9A5', '喜悦': '#F5D4A0', '平静': '#B5DDE8',
    '迷茫': '#C9A8D4', '恐惧': '#D4A0A0',
  };

  entries.forEach(([emotion, count]) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'chart-bar-wrapper';

    const value = document.createElement('div');
    value.className = 'chart-value';
    value.textContent = count;

    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    const height = (count / maxCount) * 100;
    bar.style.height = Math.max(20, height) + 'px';
    bar.style.background = emotionColors[emotion] || 'var(--primary-light)';

    const label = document.createElement('div');
    label.className = 'chart-label';
    label.textContent = emotion;

    wrapper.appendChild(value);
    wrapper.appendChild(bar);
    wrapper.appendChild(label);
    chart.appendChild(wrapper);
  });
}

function renderTimeline() {
  const timeline = document.getElementById('timeline');
  timeline.innerHTML = '';

  const recent = state.sessions.slice(-10).reverse();

  recent.forEach(s => {
    const date = new Date(s.date);
    const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.title = '点击查看完整对话';

    const dateEl = document.createElement('div');
    dateEl.className = 'timeline-date';
    dateEl.textContent = dateStr;

    const content = document.createElement('div');
    content.className = 'timeline-content';

    const emotion = s.emotion?.primaryEmotion || '未识别';
    content.innerHTML = `
      <div class="timeline-emotion">情绪 · ${emotion}</div>
      <div class="timeline-note">${s.messages[0]?.content.slice(0, 50) || '开始倾诉'}${s.messages[0]?.content?.length > 50 ? '…' : ''}</div>
    `;

    item.appendChild(dateEl);
    item.appendChild(content);
    item.addEventListener('click', () => showConversationDetail(s));
    timeline.appendChild(item);
  });
}

async function renderPersonalityAnalysis() {
  const container = document.getElementById('personalityAnalysis');

  if (state.sessions.length < 2) {
    container.innerHTML = '<p class="soft-text">再多倾诉几次，心屿会更了解你 🌱</p>';
    return;
  }

  // 检查是否有缓存的分析结果
  const cached = localStorage.getItem('xinyu_analysis');
  if (cached) {
    try {
      displayPersonality(JSON.parse(cached));
      return;
    } catch {}
  }

  container.innerHTML = '<p class="soft-text">正在用心了解你… 请稍候 🌿</p>';

  try {
    const res = await fetch('/api/analyze-personality', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessions: state.sessions.slice(-5).map(s => ({
          date: s.date,
          emotion: s.emotion,
          messages: s.messages.slice(0, 6).map(m => ({ role: m.role, content: m.content.slice(0, 100) }))
        }))
      })
    });
    const data = await res.json();
    if (data && data.summary) {
      localStorage.setItem('xinyu_analysis', JSON.stringify(data));
      displayPersonality(data);
    } else {
      container.innerHTML = '<p class="soft-text">继续倾诉，心屿会更好地了解你 🌸</p>';
    }
  } catch {
    container.innerHTML = '<p class="soft-text">暂时无法完成分析，稍后再试 🌿</p>';
  }
}

function displayPersonality(data) {
  const container = document.getElementById('personalityAnalysis');
  let html = '';

  // MBTI 类型卡片
  if (data.mbtiType) {
    html += `
      <div class="type-card">
        <div class="type-badge">${data.mbtiType}</div>
        <div class="type-desc"><strong>MBTI 推测</strong><br>${data.mbtiDescription || ''}</div>
      </div>`;
  }

  // 九型人格卡片
  if (data.enneagramType) {
    html += `
      <div class="type-card">
        <div class="type-badge">${data.enneagramType}</div>
        <div class="type-desc"><strong>九型人格推测</strong><br>${data.enneagramDescription || ''}</div>
      </div>`;
  }

  if (data.personalityTraits) {
    html += '<p style="margin-bottom:8px;margin-top:4px;"><strong>💫 你身上闪烁的特质</strong></p>';
    html += '<div style="margin-bottom:16px;">';
    data.personalityTraits.forEach(t => { html += `<span class="trait-tag">${t}</span> `; });
    html += '</div>';
  }

  if (data.emotionalPatterns) {
    html += `<p style="margin-bottom:12px;"><strong>🌊 情绪模式</strong><br>${data.emotionalPatterns}</p>`;
  }

  if (data.strengths) {
    html += '<p style="margin-bottom:8px;"><strong>✨ 你的内在力量</strong></p>';
    data.strengths.forEach(s => { html += `<div class="strength-item">${s}</div>`; });
  }

  if (data.growthSuggestions) {
    html += '<p style="margin-bottom:8px; margin-top:12px;"><strong>🌱 成长建议</strong></p>';
    data.growthSuggestions.forEach(s => { html += `<div class="suggestion-item">${s}</div>`; });
  }

  html += `<p style="margin-top:16px; padding:16px; background:var(--bg); border-radius:10px; font-style:italic; color:var(--primary-dark);">${data.summary}</p>`;

  container.innerHTML = html;
}

async function refreshAnalysis() {
  localStorage.removeItem('xinyu_analysis');
  await renderPersonalityAnalysis();
}

// ===== 自动调整输入框 =====
dom.userInput.addEventListener('input', autoResizeInput);
function autoResizeInput() {
  dom.userInput.style.height = 'auto';
  dom.userInput.style.height = Math.min(dom.userInput.scrollHeight, 120) + 'px';
}

// ===== 对话记录弹窗 =====
function showConversationDetail(session) {
  const modal = document.getElementById('historyModal');
  const title = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');

  const date = new Date(session.date);
  const dateStr = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  const emotion = session.emotion?.primaryEmotion || '未识别';
  const intensity = session.emotion?.emotionIntensity ? ` · 强度 ${session.emotion.emotionIntensity}/10` : '';

  title.textContent = '💬 对话回顾';

  let html = `<div class="modal-meta"><span>${dateStr}</span><span>情绪 · ${emotion}${intensity}</span></div>`;

  session.messages.forEach(m => {
    const role = m.role === 'user' ? 'user' : 'ai';
    const avatar = m.role === 'user' ? '💝' : '🏝️';
    const formatted = m.content.split('\n').filter(p => p.trim()).map(p => `<p>${p}</p>`).join('');
    html += `<div class="history-msg ${role}">
      <div class="h-avatar">${avatar}</div>
      <div class="h-bubble">${formatted}</div>
    </div>`;
  });

  body.innerHTML = html;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('historyModal').style.display = 'none';
  document.body.style.overflow = '';
}

// ===== 启动 =====
document.addEventListener('DOMContentLoaded', init);
