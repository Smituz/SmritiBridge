console.log("SmritiBridge: ChatGPT extractor module loaded");

window.SmritiBridge = window.SmritiBridge || {};
window.SmritiBridge.extractors = window.SmritiBridge.extractors || {};

/**
 * Extractor function that retrieves messages from storage
 * This ensures we get the complete, deduplicated message history
 */
window.SmritiBridge.extractors.chatgpt = async function () {
  const conversationId = window.__SMRITI_BRIDGE_CONVERSATION_ID__;
  
  if (!conversationId) {
    console.warn("SmritiBridge: No conversation ID available");
    return null;
  }

  const storageKey = `smritibridge:chatgpt:${conversationId}`;
  const result = await chrome.storage.local.get(storageKey);
  const data = result[storageKey];

  if (!data) {
    console.warn("SmritiBridge: No data in storage yet");
    return null;
  }

  console.log(`SmritiBridge Extractor: Retrieved ${data.messages.length} messages from storage`);

  return {
    conversationId: data.conversationId,
    title: document.title,
    url: window.location.href,
    messages: data.messages,
    lastUpdated: data.lastUpdated
  };
};

/**
 * Alternative: Extract directly from DOM (useful for debugging)
 */
window.SmritiBridge.extractors.chatgptDirect = function () {
  const messages = [];
  
  document.querySelectorAll('[data-message-author-role]').forEach(node => {
    const role = node.getAttribute('data-message-author-role');
    const text = node.innerText?.trim() || "";
    
    if (text.length > 0 && (role === 'user' || role === 'assistant')) {
      messages.push({ role, text });
    }
  });

  return {
    title: document.title,
    url: window.location.href,
    messages
  };
};