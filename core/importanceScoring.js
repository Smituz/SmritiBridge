console.log("SmritiBridge: importance scoring engine loaded");

window.SmritiBridge = window.SmritiBridge || {};
window.SmritiBridge.core = window.SmritiBridge.core || {};

/* ============================================================
   IMPORTANCE SCORING ENGINE
   Assigns numerical scores to messages based on content analysis
============================================================ */

/**
 * Common/stop words to ignore during analysis
 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'is', 'was', 'are', 'been', 'be', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'can', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'this', 'that',
  'these', 'those', 'am', 'my', 'your', 'his', 'her', 'its', 'our', 'their'
]);

/**
 * High-value linguistic markers
 */
const IMPORTANCE_MARKERS = {
  // Decision indicators (high importance)
  decision: [
    'decide', 'decided', 'decision', 'choose', 'chose', 'selected',
    'finalize', 'approved', 'confirm', 'go with', 'let\'s use',
    'we will', 'we should', 'final', 'conclusion'
  ],
  
  // Constraint indicators (high importance)
  constraint: [
    'must', 'required', 'need', 'necessary', 'cannot', 'can\'t',
    'should not', 'shouldn\'t', 'deadline', 'limit', 'only',
    'exactly', 'specifically', 'restricted', 'constraint'
  ],
  
  // Question indicators (medium-high importance)
  question: [
    'how', 'what', 'why', 'when', 'where', 'which', 'who',
    'can you', 'could you', 'would you', 'is it', 'are there'
  ],
  
  // Action/imperative indicators (medium importance)
  action: [
    'create', 'build', 'make', 'implement', 'develop', 'write',
    'design', 'fix', 'solve', 'help', 'show', 'explain',
    'generate', 'add', 'remove', 'update', 'modify'
  ],
  
  // Technical content indicators (high importance)
  technical: [
    'code', 'function', 'class', 'method', 'algorithm', 'api',
    'database', 'error', 'bug', 'test', 'deploy', 'debug',
    'syntax', 'variable', 'parameter', 'return', 'import'
  ]
};

/**
 * Extract sentences from text
 */
function extractSentences(text) {
  // Split on sentence boundaries (., !, ?)
  return text
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Tokenize text into words (lowercase, no punctuation)
 */
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Remove punctuation
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

/**
 * Check if text contains code blocks
 */
function hasCodeBlock(text) {
  return /```|`[^`]+`|\{|\}|\(|\)|function|const|let|var|class/i.test(text);
}

/**
 * Check if text contains lists or structured content
 */
function hasStructuredContent(text) {
  const lines = text.split('\n');
  const bulletPoints = lines.filter(line => /^[-*•]\s/.test(line.trim())).length;
  const numberedPoints = lines.filter(line => /^\d+\.\s/.test(line.trim())).length;
  
  return bulletPoints >= 2 || numberedPoints >= 2;
}

/**
 * Calculate marker score based on presence of importance markers
 */
function calculateMarkerScore(text) {
  const lowerText = text.toLowerCase();
  let score = 0;
  
  // Check each category of markers
  for (const [category, markers] of Object.entries(IMPORTANCE_MARKERS)) {
    const matchCount = markers.filter(marker => 
      lowerText.includes(marker.toLowerCase())
    ).length;
    
    if (matchCount > 0) {
      // Weight by category
      const categoryWeights = {
        decision: 3.0,
        constraint: 2.5,
        question: 2.0,
        action: 1.5,
        technical: 2.0
      };
      
      score += matchCount * (categoryWeights[category] || 1.0);
    }
  }
  
  return score;
}

/**
 * Calculate position score (first and last messages are more important)
 */
function calculatePositionScore(index, totalMessages) {
  if (totalMessages <= 1) return 2.0;
  
  // First message: high importance
  if (index === 0) return 3.0;
  
  // Last few messages: very high importance
  if (index >= totalMessages - 3) return 4.0;
  
  // Second and third messages: medium-high importance
  if (index <= 2) return 2.0;
  
  // Middle messages: baseline
  return 1.0;
}

/**
 * Calculate length score (very short or very long messages less important)
 */
function calculateLengthScore(text) {
  const wordCount = text.split(/\s+/).length;
  
  // Very short messages (1-5 words): likely acknowledgments
  if (wordCount <= 5) return 0.5;
  
  // Short messages (6-20 words): normal importance
  if (wordCount <= 20) return 1.0;
  
  // Medium messages (21-100 words): high importance
  if (wordCount <= 100) return 1.5;
  
  // Long messages (101-300 words): medium importance
  if (wordCount <= 300) return 1.2;
  
  // Very long messages (300+ words): lower importance (often verbose explanations)
  return 0.8;
}

/**
 * Calculate sentence-level importance
 */
function calculateSentenceImportance(sentence) {
  let score = 1.0; // Base score
  
  // Questions are important
  if (sentence.trim().endsWith('?')) {
    score += 2.0;
  }
  
  // Sentences with imperatives (commands)
  const imperativePatterns = /^(please |could you |can you |would you )?(\w+)/i;
  const match = sentence.match(imperativePatterns);
  if (match && IMPORTANCE_MARKERS.action.some(verb => 
    sentence.toLowerCase().includes(verb)
  )) {
    score += 1.5;
  }
  
  // Sentences with numbers/data
  if (/\d+/.test(sentence)) {
    score += 1.0;
  }
  
  return score;
}

/**
 * Main function: Calculate importance score for a single message
 * Returns a score typically between 0-20 (higher = more important)
 */
window.SmritiBridge.core.calculateMessageImportance = function(message, index, allMessages) {
  const { role, text } = message;
  
  let totalScore = 0;
  
  // 1. ROLE WEIGHT: User messages are MUCH more important for context transfer
  const roleWeight = role === 'user' ? 5.0 : 1.0; // Increased from 2.0 to 5.0
  totalScore += roleWeight;
  
  // 2. POSITION SCORE: Context matters
  const positionScore = calculatePositionScore(index, allMessages.length);
  totalScore += positionScore;
  
  // 3. MARKER SCORE: High-value linguistic patterns
  const markerScore = calculateMarkerScore(text);
  totalScore += markerScore;
  
  // 4. LENGTH SCORE: Different handling for user vs assistant
  if (role === 'user') {
    // For user messages: don't penalize short messages (they're often precise)
    const wordCount = text.split(/\s+/).length;
    if (wordCount >= 3) {
      totalScore += 2.0; // Bonus for having substance
    }
    // No length penalty for user messages
  } else {
    // For assistant: use length score as before
    const lengthScore = calculateLengthScore(text);
    totalScore *= lengthScore;
  }
  
  // 5. CONTENT TYPE BONUSES
  if (hasCodeBlock(text)) {
    totalScore += 3.0; // Code is very important
  }
  
  if (hasStructuredContent(text)) {
    totalScore += 2.0; // Lists/structured info important
  }
  
  // 6. SENTENCE-LEVEL ANALYSIS (for user messages)
  if (role === 'user') {
    const sentences = extractSentences(text);
    const avgSentenceImportance = sentences.reduce((sum, sent) => 
      sum + calculateSentenceImportance(sent), 0
    ) / (sentences.length || 1);
    
    totalScore += avgSentenceImportance * 1.5; // Increased multiplier for user
  }
  
  // 7. RECENCY BONUS: Recent messages get a boost (same for both)
  const recencyFactor = Math.max(0, (allMessages.length - index) / allMessages.length);
  totalScore += recencyFactor * 2.0;
  
  return Math.round(totalScore * 10) / 10; // Round to 1 decimal place
};

/**
 * Score all messages and return sorted by importance
 */
window.SmritiBridge.core.scoreAllMessages = function(messages) {
  return messages.map((msg, idx) => ({
    ...msg,
    importanceScore: window.SmritiBridge.core.calculateMessageImportance(msg, idx, messages),
    originalIndex: idx
  })).sort((a, b) => b.importanceScore - a.importanceScore);
};

/**
 * Get top N most important messages
 */
window.SmritiBridge.core.getTopMessages = function(messages, topN = 10) {
  const scored = window.SmritiBridge.core.scoreAllMessages(messages);
  return scored.slice(0, topN);
};

/**
 * Analyze conversation and return statistics
 */
window.SmritiBridge.core.analyzeImportance = function(messages) {
  const scored = messages.map((msg, idx) => ({
    ...msg,
    importanceScore: window.SmritiBridge.core.calculateMessageImportance(msg, idx, messages)
  }));
  
  const scores = scored.map(m => m.importanceScore);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  
  return {
    totalMessages: messages.length,
    averageScore: Math.round(avgScore * 10) / 10,
    maxScore: Math.round(maxScore * 10) / 10,
    minScore: Math.round(minScore * 10) / 10,
    scoredMessages: scored
  };
};

console.log("SmritiBridge: Importance scoring functions ready");