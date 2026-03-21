console.log("SmritiBridge: Popup loaded");

/* ============================================================
   Wait for DOM to be ready
============================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  console.log("SmritiBridge: DOM ready, initializing popup");

  /* ============================================================
     DOM Elements
  ============================================================ */

  const statusDot = document.querySelector('.status-dot');
  const statusText = document.getElementById('status-text');
  const totalMessagesEl = document.getElementById('total-messages');
  const userMessagesEl = document.getElementById('user-messages');
  const assistantMessagesEl = document.getElementById('assistant-messages');
  const topMessagesEl = document.getElementById('top-messages');
  const generateBtn = document.getElementById('generate-btn');
  const exportResult = document.getElementById('export-result');
  const contextOutput = document.getElementById('context-output');
  const copyBtn = document.getElementById('copy-btn');
  const compressedCountEl = document.getElementById('compressed-count');
  const tokenCountEl = document.getElementById('token-count');
  const reductionPercentEl = document.getElementById('reduction-percent');

  /* ============================================================
     Helper Functions
  ============================================================ */

  function setStatus(status, message) {
    statusDot.className = 'status-dot ' + status;
    statusText.textContent = message;
  }

  function updateConversationInfo(messages) {
    const userCount = messages.filter(m => m.role === 'user').length;
    const assistantCount = messages.filter(m => m.role === 'assistant').length;
    
    totalMessagesEl.textContent = messages.length;
    userMessagesEl.textContent = userCount;
    assistantMessagesEl.textContent = assistantCount;
  }

  function displayTopMessages(analysis) {
    const topMessages = analysis.scoredMessages
      .sort((a, b) => b.importanceScore - a.importanceScore)
      .slice(0, 5);
    
    topMessagesEl.innerHTML = topMessages.map(msg => `
      <div class="message-item ${msg.role}">
        <div class="message-header">
          <span class="message-role">${msg.role === 'user' ? '👤 User' : '🤖 Assistant'}</span>
          <span class="message-score">${msg.importanceScore.toFixed(1)}</span>
        </div>
        <div class="message-preview">${msg.text}</div>
      </div>
    `).join('');
  }

  /* ============================================================
     Communication with Content Script - FIXED
  ============================================================ */

  async function getConversationId() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url || !tab.url.includes('chatgpt.com')) {
      throw new Error('Not on ChatGPT page');
    }
    
    // Extract conversation ID from URL
    const match = tab.url.match(/\/c\/([^/?]+)/);
    return match ? match[1] : null;
  }

  async function getMessages() {
    const conversationId = await getConversationId();
    
    if (!conversationId) {
      return null;
    }
    
    const key = `smritibridge:chatgpt:${conversationId}`;
    
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => {
        if (chrome.runtime.lastError) {
          console.error('Storage error:', chrome.runtime.lastError);
          resolve(null);
        } else {
          resolve(result[key]?.messages || null);
        }
      });
    });
  }

  async function executeInPage(funcString, args = []) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      args: args,
      func: new Function('return ' + funcString)()
    });
    
    return results[0].result;
  }

  async function analyzeImportance(messages) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      args: [messages],
      func: (msgs) => {
        if (!window.SmritiBridge?.core?.analyzeImportance) {
          throw new Error('Importance scoring not loaded');
        }
        return window.SmritiBridge.core.analyzeImportance(msgs);
      }
    });
    
    return results[0].result;
  }

  async function compressAndGenerate(messages, targetTokens) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      args: [messages, targetTokens],
      func: (msgs, tokens) => {
        if (!window.SmritiBridge?.core?.generateContextPrompt) {
          throw new Error('Compression module not loaded');
        }
        
        const result = window.SmritiBridge.core.smartCompress(msgs, tokens);
        const prompt = window.SmritiBridge.core.generateContextPrompt(msgs, {
          includeMetadata: true,
          targetTokens: tokens
        });
        
        return { result, prompt };
      }
    });
    
    return results[0].result;
  }

  /* ============================================================
     Main Logic
  ============================================================ */

  async function initialize() {
    try {
      setStatus('', 'Checking ChatGPT page...');
      
      // Check if on ChatGPT
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab || !tab.url || !tab.url.includes('chatgpt.com')) {
        setStatus('error', 'Not on ChatGPT page');
        topMessagesEl.innerHTML = '<p class="loading" style="color: #dc3545;">Please open a ChatGPT conversation page.</p>';
        return;
      }
      
      // Get messages
      const messages = await getMessages();
      
      if (!messages || messages.length === 0) {
        setStatus('error', 'No conversation captured');
        topMessagesEl.innerHTML = '<p class="loading" style="color: #dc3545;">No messages found. Make sure you\'re on a ChatGPT conversation and refresh the page.</p>';
        return;
      }
      
      // Update info
      setStatus('active', 'Conversation captured');
      updateConversationInfo(messages);
      
      // Analyze importance
      topMessagesEl.innerHTML = '<p class="loading">Analyzing importance...</p>';
      const analysis = await analyzeImportance(messages);
      displayTopMessages(analysis);
      
      // Enable generate button
      generateBtn.disabled = false;
      
      // Store messages for later use
      window.currentMessages = messages;
      
    } catch (error) {
      console.error('Initialization error:', error);
      setStatus('error', 'Error: ' + error.message);
      topMessagesEl.innerHTML = `<p class="loading" style="color: #dc3545;">${error.message}</p>`;
    }
  }

  /* ============================================================
     Event Handlers
  ============================================================ */

  generateBtn.addEventListener('click', async () => {
    try {
      generateBtn.disabled = true;
      generateBtn.innerHTML = '<span class="btn-icon">⏳</span> Generating...';
      
      const { result, prompt } = await compressAndGenerate(window.currentMessages, 2500);
      
      // Show results
      exportResult.classList.remove('hidden');
      compressedCountEl.textContent = result.stats.compressed;
      tokenCountEl.textContent = result.stats.estimatedTokens;
      reductionPercentEl.textContent = result.stats.compressionRatio.toFixed(1);
      contextOutput.value = prompt;
      
      // Reset button
      generateBtn.disabled = false;
      generateBtn.innerHTML = '<span class="btn-icon">🗜️</span> Generate Context';
      
    } catch (error) {
      console.error('Generation error:', error);
      alert('Error generating context: ' + error.message);
      generateBtn.disabled = false;
      generateBtn.innerHTML = '<span class="btn-icon">🗜️</span> Generate Context';
    }
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(contextOutput.value);
      
      // Visual feedback
      copyBtn.innerHTML = '<span class="btn-icon">✅</span> Copied!';
      copyBtn.classList.add('copied');
      
      setTimeout(() => {
        copyBtn.innerHTML = '<span class="btn-icon">📋</span> Copy to Clipboard';
        copyBtn.classList.remove('copied');
      }, 2000);
      
    } catch (error) {
      console.error('Copy error:', error);
      alert('Failed to copy. Please select and copy manually.');
    }
  });

  /* ============================================================
     Initialize
  ============================================================ */

  await initialize();
});