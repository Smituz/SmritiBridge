// Storage Bridge - Runs in ISOLATED world (has chrome.storage access)
console.log("SmritiBridge: Storage bridge starting (ISOLATED world)");

window.addEventListener('message', async (event) => {
  // Only accept messages from same window
  if (event.source !== window) return;
  
  const { type, requestId, key, data } = event.data;
  
  // Ignore non-SmritiBridge messages
  if (!type || !type.startsWith('SMRITI_')) return;
  
  try {
    if (type === 'SMRITI_STORAGE_SET') {
      await chrome.storage.local.set({ [key]: data });
      window.postMessage({
        type: 'SMRITI_STORAGE_SET_RESPONSE',
        requestId,
        success: true
      }, '*');
    }
    
    if (type === 'SMRITI_STORAGE_GET') {
      const result = await chrome.storage.local.get(key);
      window.postMessage({
        type: 'SMRITI_STORAGE_GET_RESPONSE',
        requestId,
        data: result[key] || null
      }, '*');
    }
  } catch (error) {
    console.error("Storage bridge error:", error);
    window.postMessage({
      type: type + '_RESPONSE',
      requestId,
      success: false,
      error: error.message
    }, '*');
  }
});

console.log("SmritiBridge: Storage bridge ready");