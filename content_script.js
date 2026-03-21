console.log("SmritiBridge: Starting in MAIN world...");

window.SmritiBridge = window.SmritiBridge || {};
window.SmritiBridge.runtime = window.SmritiBridge.runtime || {};

/* ============================================================
   Storage Functions - Bridge to ISOLATED world
============================================================ */

let requestIdCounter = 0;

const bridgeStorage = {
  set: (key, data) => {
    return new Promise((resolve) => {
      const requestId = ++requestIdCounter;
      const handler = (event) => {
        if (event.data.type === 'SMRITI_STORAGE_SET_RESPONSE' && 
            event.data.requestId === requestId) {
          window.removeEventListener('message', handler);
          resolve(event.data.success);
        }
      };
      window.addEventListener('message', handler);
      window.postMessage({ type: 'SMRITI_STORAGE_SET', requestId, key, data }, '*');
      setTimeout(() => { window.removeEventListener('message', handler); resolve(false); }, 3000);
    });
  },
  
  get: (key) => {
    return new Promise((resolve) => {
      const requestId = ++requestIdCounter;
      const handler = (event) => {
        if (event.data.type === 'SMRITI_STORAGE_GET_RESPONSE' && 
            event.data.requestId === requestId) {
          window.removeEventListener('message', handler);
          resolve(event.data.data);
        }
      };
      window.addEventListener('message', handler);
      window.postMessage({ type: 'SMRITI_STORAGE_GET', requestId, key }, '*');
      setTimeout(() => { window.removeEventListener('message', handler); resolve(null); }, 3000);
    });
  }
};

/* ============================================================
   Core Functions
============================================================ */

const getConversationId = () => {
  const match = window.location.pathname.match(/\/c\/([^/]+)/);
  if (match) return match[1];
  return window.__CONVERSATION_ID__ || null;
};

const getStorageKey = (conversationId) => {
  return `smritibridge:chatgpt:${conversationId}`;
};

const saveToStorage = async (conversationId, messages) => {
  try {
    const key = getStorageKey(conversationId);
    const success = await bridgeStorage.set(key, { 
      conversationId, 
      messages, 
      lastUpdated: Date.now() 
    });
    if (success) {
      console.log(`SmritiBridge: 💾 Saved ${messages.length} messages`);
    }
    return success;
  } catch (error) {
    console.error("SmritiBridge: Storage error:", error);
    return false;
  }
};

const getFromStorage = async (conversationId) => {
  try {
    const key = getStorageKey(conversationId);
    const result = await bridgeStorage.get(key);
    return result?.messages || [];
  } catch (error) {
    console.error("SmritiBridge: Storage error:", error);
    return [];
  }
};

/* ============================================================
   NETWORK INTERCEPTOR - Primary Extraction Method
   Intercepts ChatGPT API calls to get complete conversation
============================================================ */

const parseConversationFromJSON = (jsonData) => {
  try {
    if (!jsonData || !jsonData.mapping) return [];
    
    const messages = [];
    const mapping = jsonData.mapping;
    
    Object.values(mapping).forEach(node => {
      const message = node.message;
      
      if (message && 
          message.content && 
          message.author && 
          message.author.role !== 'system' && 
          message.content.content_type === 'text' &&
          message.content.parts && 
          message.content.parts.length > 0 &&
          message.content.parts[0].length > 0) {
        
        messages.push({
          id: message.id,
          role: message.author.role,
          text: message.content.parts.join('\n').trim(),
          timestamp: message.create_time ? message.create_time * 1000 : Date.now()
        });
      }
    });
    
    // Sort chronologically
    return messages.sort((a, b) => a.timestamp - b.timestamp);
    
  } catch (error) {
    console.error("SmritiBridge: Parsing error", error);
    return [];
  }
};

// Intercept fetch calls
const originalFetch = window.fetch;

window.fetch = async function(...args) {
  // Handle both string URL and Request object
  let resource = args[0];
  let url = "";

  if (typeof resource === 'string') {
    url = resource;
  } else if (resource instanceof Request) {
    url = resource.url;
  }

  const response = await originalFetch(...args);

  // Intercept conversation API calls
  if (url.includes('/backend-api/conversation')) {
    try {
      const clone = response.clone();
      const data = await clone.json();

      if (data.mapping) {
        console.log("SmritiBridge: 🟢 Intercepted conversation data from network");
        
        const conversationId = data.conversation_id || getConversationId();
        const extractedMessages = parseConversationFromJSON(data);
        
        if (extractedMessages.length > 0) {
          const userCount = extractedMessages.filter(m => m.role === 'user').length;
          const assistantCount = extractedMessages.filter(m => m.role === 'assistant').length;
          
          console.log(`SmritiBridge: Extracted ${extractedMessages.length} messages (${userCount} user, ${assistantCount} assistant)`);
          
          await saveToStorage(conversationId, extractedMessages);
          window.__CONVERSATION_ID__ = conversationId;
        }
      }
    } catch (err) {
      // Silent fail for non-JSON responses (streaming, etc.)
    }
  }

  return response;
};

/* ============================================================
   FALLBACK: React State Extraction
   Used if network interception doesn't capture data
============================================================ */

const extractFromReactState = () => {
  try {
    const reactContext = window.__reactRouterContext;
    
    if (!reactContext?.state?.loaderData) {
      console.warn("SmritiBridge: React state not available");
      return [];
    }
    
    const loaderData = reactContext.state.loaderData;
    let conversationData = null;
    
    for (const key in loaderData) {
      const data = loaderData[key];
      if (data && typeof data === 'object') {
        if (data.conversation || data.messages || data.mapping) {
          conversationData = data;
          break;
        }
      }
    }
    
    if (!conversationData?.mapping) {
      console.warn("SmritiBridge: No conversation data in React state");
      return [];
    }
    
    const messages = [];
    const mapping = conversationData.mapping;
    
    for (const id in mapping) {
      const node = mapping[id];
      const message = node.message;
      
      if (message && message.content && message.author) {
        const role = message.author.role;
        
        let text = '';
        if (message.content.parts && Array.isArray(message.content.parts)) {
          text = message.content.parts.join('\n');
        } else if (typeof message.content === 'string') {
          text = message.content;
        }
        
        if (text && (role === 'user' || role === 'assistant')) {
          messages.push({
            role,
            text: text.trim(),
            timestamp: message.create_time ? new Date(message.create_time * 1000).getTime() : Date.now()
          });
        }
      }
    }
    
    console.log(`SmritiBridge: Extracted ${messages.length} messages from React state`);
    return messages;
    
  } catch (error) {
    console.error("SmritiBridge: React extraction error:", error);
    return [];
  }
};

/* ============================================================
   Public API - Console Commands
============================================================ */

window.SmritiBridge.refreshMessages = async function() {
  const cid = getConversationId();
  if (!cid) {
    console.error("❌ No conversation loaded");
    return [];
  }
  
  const messages = await getFromStorage(cid);
  
  if (messages.length === 0) {
    console.warn("⚠️ No messages found in storage");
    console.log("💡 Try: SmritiBridge.forceSync() to reload and capture");
    return [];
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("📝 CONVERSATION MESSAGES");
  console.log("=".repeat(60));
  console.log(`Total: ${messages.length}\n`);
  
  messages.forEach((msg, i) => {
    const icon = msg.role === 'user' ? '👤' : '🤖';
    console.log(`${i + 1}. ${icon} [${msg.role}]:`);
    console.log(msg.text.substring(0, 200));
    console.log("-".repeat(60) + "\n");
  });
  
  return messages;
};

window.SmritiBridge.reExtract = async function() {
  console.log("\n🔄 Attempting manual extraction...\n");
  
  const cid = getConversationId();
  if (!cid) {
    console.error("❌ No conversation ID");
    return;
  }
  
  // Try React state extraction
  const messages = extractFromReactState();
  
  if (messages.length === 0) {
    console.warn("⚠️ Could not extract from React state");
    console.log("💡 Try: SmritiBridge.forceSync() to reload page and use network interception");
    return [];
  }
  
  const saved = await saveToStorage(cid, messages);
  
  const userCount = messages.filter(m => m.role === 'user').length;
  const assistantCount = messages.filter(m => m.role === 'assistant').length;
  
  console.log(`✅ Extraction complete!`);
  console.log(`📊 Total: ${messages.length} messages`);
  console.log(`👤 User: ${userCount}`);
  console.log(`🤖 Assistant: ${assistantCount}`);
  console.log(`💾 Saved: ${saved ? 'Yes' : 'No'}\n`);
  
  return messages;
};

window.SmritiBridge.forceSync = function() {
  console.log("SmritiBridge: 🔄 Reloading to capture network traffic...");
  window.location.reload();
};

window.testImportanceScoring = async function() {
  const cid = getConversationId();
  if (!cid) {
    console.error("❌ No conversation loaded");
    return;
  }
  
  const messages = await getFromStorage(cid);
  
  if (messages.length === 0) {
    console.error("❌ No messages found");
    console.log("💡 Try: SmritiBridge.refreshMessages() first");
    return;
  }
  
  if (!window.SmritiBridge?.core?.analyzeImportance) {
    console.error("❌ Importance scoring module not loaded!");
    console.error("Check that importanceScoring.js is in manifest.json");
    return;
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("🔬 IMPORTANCE SCORING TEST");
  console.log("=".repeat(60));
  
  try {
    const analysis = window.SmritiBridge.core.analyzeImportance(messages);
    
    console.log(`\n📊 Statistics:`);
    console.log(`Total Messages: ${analysis.totalMessages}`);
    console.log(`Average Score: ${analysis.averageScore}`);
    console.log(`Max Score: ${analysis.maxScore}`);
    console.log(`Min Score: ${analysis.minScore}\n`);
    
    console.log("📈 Top 10 Most Important Messages:\n");
    
    analysis.scoredMessages
      .sort((a, b) => b.importanceScore - a.importanceScore)
      .slice(0, 10)
      .forEach((msg, i) => {
        const icon = msg.role === 'user' ? '👤' : '🤖';
        const preview = msg.text.substring(0, 100);
        console.log(`${i + 1}. ${icon} [Score: ${msg.importanceScore}]`);
        console.log(`   ${preview}...`);
        console.log("");
      });
    
    console.log("=".repeat(60));
    console.log("✅ Test complete!\n");
    
  } catch (error) {
    console.error("❌ Error during analysis:", error);
  }
};

window.testCompression = async function() {
  const cid = getConversationId();
  if (!cid) {
    console.error("❌ No conversation loaded");
    return;
  }
  
  const messages = await getFromStorage(cid);
  
  if (messages.length === 0) {
    console.error("❌ No messages found");
    return;
  }
  
  if (!window.SmritiBridge?.core?.smartCompress) {
    console.error("❌ Compression module not loaded!");
    return;
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("🗜️ SMART COMPRESSION TEST");
  console.log("=".repeat(60));
  
  const result = window.SmritiBridge.core.smartCompress(messages, 2500);
  
  console.log("\n📊 Compression Results:");
  console.log(`Original: ${result.stats.original} messages`);
  console.log(`Compressed: ${result.stats.compressed} messages`);
  console.log(`Reduction: ${result.stats.compressionRatio}%`);
  console.log(`Tokens: ${result.stats.estimatedTokens} / ${result.stats.targetTokens}`);
  console.log(`User: ${result.stats.userMessages}, Assistant: ${result.stats.assistantMessages}`);
  
  console.log("\n💡 Generate prompt with:");
  console.log("   const prompt = SmritiBridge.core.generateContextPrompt(messages)");
  console.log("   console.log(prompt)\n");
  
  return result;
};

window.exportContext = async function(targetTokens = 2500) {
  const cid = getConversationId();
  if (!cid) {
    console.error("❌ No conversation loaded");
    return;
  }
  
  const messages = await getFromStorage(cid);
  
  if (messages.length === 0) {
    console.error("❌ No messages found");
    return;
  }
  
  console.log("\n📤 Generating context prompt...\n");
  
  const prompt = window.SmritiBridge.core.generateContextPrompt(messages, {
    includeMetadata: true,
    targetTokens
  });
  
  console.log(prompt);
  console.log("\n" + "=".repeat(60));
  console.log("✅ Context prompt generated!");
  console.log("📋 Copy the output above and paste into another AI tool\n");
  
  return prompt;
};

/* ============================================================
   Initialize
============================================================ */

(async () => {
  try {
    if (!location.hostname.includes("chatgpt.com")) {
      console.log("SmritiBridge: Not on ChatGPT domain");
      return;
    }
    
    console.log("SmritiBridge: 🕸️ Network interceptor active");
    
    const cid = getConversationId();
    if (cid) {
      window.__CONVERSATION_ID__ = cid;
      console.log(`SmritiBridge: Conversation ID: ${cid}`);
    }
    
    // Wait for network request to complete (gives interceptor time to capture)
    setTimeout(async () => {
      const currentCid = getConversationId();
      if (currentCid) {
        const messages = await getFromStorage(currentCid);
        
        if (messages.length > 0) {
          const userCount = messages.filter(m => m.role === 'user').length;
          const assistantCount = messages.filter(m => m.role === 'assistant').length;
          
          console.log("\n" + "=".repeat(60));
          console.log("📝 CONVERSATION CAPTURED");
          console.log("=".repeat(60));
          console.log(`Total: ${messages.length} messages`);
          console.log(`👤 User: ${userCount}`);
          console.log(`🤖 Assistant: ${assistantCount}`);
          console.log("=".repeat(60) + "\n");
          
          console.log("✅ SmritiBridge Ready!");
        } else {
          console.log("SmritiBridge: ⏳ Waiting for network data...");
          console.log("💡 If no data after 5 seconds, try: SmritiBridge.forceSync()");
        }
        
        console.log("\n💡 Available commands:");
        console.log("   SmritiBridge.refreshMessages()  - View all messages");
        console.log("   SmritiBridge.reExtract()        - Manual extraction (fallback)");
        console.log("   SmritiBridge.forceSync()        - Reload page to re-capture");
        console.log("   testImportanceScoring()         - Analyze importance\n");
        console.log("   testCompression()               - Test compression algorithm");
        console.log("   exportContext()                 - Generate context prompt for transfer");
      }
    }, 3000);
    
  } catch (error) {
    console.error("SmritiBridge: Initialization error:", error);
  }
})();