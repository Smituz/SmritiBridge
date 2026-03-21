console.log("SmritiBridge: heuristics engine loaded");

window.SmritiBridge = window.SmritiBridge || {};
window.SmritiBridge.core = window.SmritiBridge.core || {};

/* ============================================================
   Utility helpers (private-style, but still namespaced)
============================================================ */

window.SmritiBridge.core._getUserMessages = function (messages) {
  return messages.filter(m => m.role === "user");
};

window.SmritiBridge.core._getAssistantMessages = function (messages) {
  return messages.filter(m => m.role === "assistant");
};

/* ============================================================
   USER OBJECTIVE DETECTION
   (What is the user trying to achieve overall?)
============================================================ */

window.SmritiBridge.core.detectUserObjective = function (messages) {
  const userMessages = window.SmritiBridge.core._getUserMessages(messages);

  if (userMessages.length === 0) {
    return {
      description: "",
      confidence: "low"
    };
  }

  // For now: take signal from the *last few* user messages
  const recent = userMessages.slice(-3).map(m => m.text).join(" ");

  return {
    description: recent.slice(0, 200), // placeholder, not interpretation
    confidence: "medium"
  };
};

/* ============================================================
   KEY DECISIONS DETECTION
   (Explicit choices, confirmations, approvals by user)
============================================================ */

window.SmritiBridge.core.detectKeyDecisions = function (messages) {
  const decisions = [];
  const userMessages = window.SmritiBridge.core._getUserMessages(messages);

  const decisionPatterns = [
    /let us/i,
    /we will/i,
    /go with/i,
    /finalize/i,
    /approved/i,
    /lock this/i
  ];

  userMessages.forEach(m => {
    if (decisionPatterns.some(p => p.test(m.text))) {
      decisions.push(m.text);
    }
  });

  return decisions;
};

/* ============================================================
   USER CONSTRAINTS DETECTION
   (Deadlines, limits, preferences, rules)
============================================================ */

window.SmritiBridge.core.detectUserConstraints = function (messages) {
  const constraints = [];
  const userMessages = window.SmritiBridge.core._getUserMessages(messages);

  const constraintPatterns = [
    /days|deadline|time/i,
    /must|should not|cannot|can't/i,
    /only|strictly|exactly/i
  ];

  userMessages.forEach(m => {
    if (constraintPatterns.some(p => p.test(m.text))) {
      constraints.push(m.text);
    }
  });

  return constraints;
};

/* ============================================================
   OPEN QUESTIONS DETECTION
   (Unresolved questions that matter)
============================================================ */

window.SmritiBridge.core.detectOpenQuestions = function (messages) {
  const openQuestions = [];
  const userMessages = window.SmritiBridge.core._getUserMessages(messages);

  userMessages.forEach(m => {
    if (m.text.trim().endsWith("?")) {
      openQuestions.push(m.text);
    }
  });

  return openQuestions;
};

/* ============================================================
   AI-SUGGESTED IDEAS
   (Assistant proposals that influenced direction)
============================================================ */

window.SmritiBridge.core.detectAISuggestedIdeas = function (messages) {
  const ideas = [];
  const assistantMessages =
    window.SmritiBridge.core._getAssistantMessages(messages);

  const ideaPatterns = [
    /you could/i,
    /one option/i,
    /another approach/i,
    /i suggest/i,
    /we can/i
  ];

  assistantMessages.forEach(m => {
    if (ideaPatterns.some(p => p.test(m.text))) {
      ideas.push(m.text);
    }
  });

  return ideas;
};
