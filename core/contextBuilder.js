console.log("SmritiBridge: context builder loaded");

window.SmritiBridge = window.SmritiBridge || {};
window.SmritiBridge.core = window.SmritiBridge.core || {};

window.SmritiBridge.core.buildContext = function (rawData) {
  const { title, url, messages } = rawData;
  const context = window.SmritiBridge.core.createEmptyContext();

  /* ---------- Meta ---------- */
  context.meta.source_platform = "chatgpt";
  context.meta.conversation_url = url;

  /* ---------- Sliding Window ---------- */
  const WINDOW_SIZE = 10;
  context.recent_context =
    messages.length <= WINDOW_SIZE
      ? messages
      : messages.slice(-WINDOW_SIZE);

  /* ---------- Heuristic Extraction ---------- */
  context.user_objective =
    window.SmritiBridge.core.detectUserObjective(messages);

  context.key_decisions =
    window.SmritiBridge.core.detectKeyDecisions(messages);

  context.user_constraints =
    window.SmritiBridge.core.detectUserConstraints(messages);

  context.open_questions =
    window.SmritiBridge.core.detectOpenQuestions(messages);

  context.ai_suggested_ideas =
    window.SmritiBridge.core.detectAISuggestedIdeas(messages);

  return context;
};
