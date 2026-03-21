console.log("SmritiBridge: Compression engine loaded");

window.SmritiBridge = window.SmritiBridge || {};
window.SmritiBridge.core = window.SmritiBridge.core || {};

/* ============================================================
   TOKEN ESTIMATION
   Approximate token count (1 token ≈ 4 characters)
============================================================ */

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function estimateMessageTokens(message) {
  // Account for role markers and formatting
  const overhead = 10; // "User: " or "Assistant: " + newlines
  return estimateTokens(message.text) + overhead;
}

/* ============================================================
   COMPRESSION STRATEGIES
============================================================ */

/**
 * Strategy 1: KEEP FIRST AND LAST (Bookends)
 * Always keep the first few and last few messages
 */
function getBookendMessages(messages, firstN = 3, lastN = 5) {
  const first = messages.slice(0, Math.min(firstN, messages.length));
  const last = messages.slice(Math.max(0, messages.length - lastN));
  
  return {
    first,
    last,
    indices: new Set([
      ...first.map((_, i) => i),
      ...last.map((_, i) => messages.length - lastN + i)
    ])
  };
}

/**
 * Strategy 2: IMPORTANCE THRESHOLD
 * Keep all messages above a certain importance score
 */
function getHighImportanceMessages(scoredMessages, threshold) {
  return scoredMessages.filter(msg => msg.importanceScore >= threshold);
}

/**
 * Strategy 3: TOP-N SELECTION
 * Keep the N most important messages
 */
function getTopNMessages(scoredMessages, n) {
  return scoredMessages
    .sort((a, b) => b.importanceScore - a.importanceScore)
    .slice(0, n);
}

/**
 * Strategy 4: TOKEN-BUDGET COMPRESSION
 * Keep as many high-importance messages as fit in token budget
 */
function compressToTokenBudget(scoredMessages, maxTokens) {
  // Sort by importance (descending)
  const sorted = [...scoredMessages].sort((a, b) => b.importanceScore - a.importanceScore);
  
  const selected = [];
  let currentTokens = 0;
  
  for (const msg of sorted) {
    const msgTokens = estimateMessageTokens(msg);
    
    if (currentTokens + msgTokens <= maxTokens) {
      selected.push(msg);
      currentTokens += msgTokens;
    } else {
      break; // Budget exhausted
    }
  }
  
  // Sort back to chronological order
  return selected.sort((a, b) => a.originalIndex - b.originalIndex);
}

/**
 * Strategy 5: SMART COMPRESSION (Hybrid)
 * Combines multiple strategies for best results
 */
window.SmritiBridge.core.smartCompress = function(messages, targetTokens = 2500) {
  console.log(`\nSmritiBridge: Starting smart compression...`);
  console.log(`Input: ${messages.length} messages`);
  
  // Step 1: Score all messages
  const scoredMessages = messages.map((msg, idx) => ({
    ...msg,
    importanceScore: window.SmritiBridge.core.calculateMessageImportance(msg, idx, messages),
    originalIndex: idx,
    tokens: estimateMessageTokens(msg)
  }));
  
  // Step 2: Identify bookends (must keep)
  const bookends = getBookendMessages(messages, 2, 3);
  
  // Step 3: Calculate remaining budget
  const bookendTokens = [...bookends.first, ...bookends.last]
    .reduce((sum, msg, idx) => sum + estimateMessageTokens(scoredMessages[idx]), 0);
  
  const remainingBudget = targetTokens - bookendTokens;
  
  console.log(`Reserved ${bookendTokens} tokens for bookends (first 2 + last 3)`);
  console.log(`Remaining budget: ${remainingBudget} tokens`);
  
  // Step 4: Select middle messages by importance within budget
  const middleMessages = scoredMessages.filter((msg, idx) => !bookends.indices.has(idx));
  
  const selectedMiddle = [];
  let currentTokens = 0;
  
  // Sort middle by importance
  const sortedMiddle = middleMessages.sort((a, b) => b.importanceScore - a.importanceScore);
  
  for (const msg of sortedMiddle) {
    if (currentTokens + msg.tokens <= remainingBudget) {
      selectedMiddle.push(msg);
      currentTokens += msg.tokens;
    }
  }
  
  // Step 5: Combine bookends + selected middle, sort chronologically
  const compressed = [
    ...scoredMessages.filter((msg, idx) => bookends.indices.has(idx)),
    ...selectedMiddle
  ].sort((a, b) => a.originalIndex - b.originalIndex);
  
  // Step 6: Calculate statistics
  const totalTokens = compressed.reduce((sum, msg) => sum + msg.tokens, 0);
  const compressionRatio = ((1 - compressed.length / messages.length) * 100).toFixed(1);
  
  const userCount = compressed.filter(m => m.role === 'user').length;
  const assistantCount = compressed.filter(m => m.role === 'assistant').length;
  
  console.log(`\n✅ Compression complete!`);
  console.log(`Output: ${compressed.length} messages (${compressionRatio}% reduction)`);
  console.log(`Estimated tokens: ${totalTokens} / ${targetTokens}`);
  console.log(`User: ${userCount}, Assistant: ${assistantCount}`);
  console.log(`Avg importance score: ${(compressed.reduce((s, m) => s + m.importanceScore, 0) / compressed.length).toFixed(1)}\n`);
  
  return {
    compressed,
    stats: {
      original: messages.length,
      compressed: compressed.length,
      compressionRatio: parseFloat(compressionRatio),
      estimatedTokens: totalTokens,
      targetTokens,
      userMessages: userCount,
      assistantMessages: assistantCount,
      avgImportanceScore: compressed.reduce((s, m) => s + m.importanceScore, 0) / compressed.length
    }
  };
};

/**
 * Generate readable context for export
 */
window.SmritiBridge.core.generateContextPrompt = function(messages, options = {}) {
  const {
    includeMetadata = true,
    targetTokens = 2500
  } = options;
  
  // Compress messages
  const { compressed, stats } = window.SmritiBridge.core.smartCompress(messages, targetTokens);
  
  let prompt = 'You are continuing a conversation that previously occurred in ChatGPT.What you see in this message is carefully orchestrated attempt on extracting the most useful user and assistant messages from that conversation to build context for you.\n';
  
  if (includeMetadata) {
    prompt += `# Conversation Context
Source: ChatGPT
Date: ${new Date().toLocaleDateString()}
Original Messages: ${stats.original}
Compressed: ${stats.compressed} (${stats.compressionRatio}% reduction)
Estimated Tokens: ${stats.estimatedTokens}

---

`;
  }
  
  prompt += `# Conversation History\n\n`;
  
  compressed.forEach((msg, idx) => {
    const icon = msg.role === 'user' ? '👤 User' : '🤖 Assistant';
    prompt += `## ${icon} (Message ${msg.originalIndex + 1})\n`;
    prompt += `${msg.text}\n\n`;
    
    // Add gap indicator if messages are non-consecutive
    if (idx < compressed.length - 1) {
      const nextIdx = compressed[idx + 1].originalIndex;
      const gap = nextIdx - msg.originalIndex - 1;
      
      if (gap > 0) {
        prompt += `_[... ${gap} message${gap > 1 ? 's' : ''} omitted ...]_\n\n Please continue the discussion from this point.`;
      }
    }
  });
  
  return prompt;
};

/**
 * Test compression with different strategies
 */
window.SmritiBridge.core.testCompression = function(messages) {
  console.log("\n" + "=".repeat(60));
  console.log("🧪 COMPRESSION ALGORITHM TEST");
  console.log("=".repeat(60));
  console.log(`\nInput: ${messages.length} messages\n`);
  
  const budgets = [1000, 2000, 3000, 4000];
  
  budgets.forEach(budget => {
    const result = window.SmritiBridge.core.smartCompress(messages, budget);
    console.log(`Budget ${budget} tokens → ${result.compressed.length} messages (${result.stats.compressionRatio}% reduction)`);
  });
  
  console.log("\n" + "=".repeat(60) + "\n");
};

console.log("SmritiBridge: Compression functions ready");