/**
 * SmritiBridge Context Schema
 * ---------------------------
 * This schema represents structured, user-centric context
 * extracted from an AI-assisted conversation.
 *
 * IMPORTANT:
 * - Assistant responses are analysis-only
 * - No field should be treated as authoritative truth
 * - This object may later be rephrased by an LLM,
 *   but raw conversations are NEVER passed to LLMs
 */
console.log("SmritiBridge: context schema loaded");

window.SmritiBridge = window.SmritiBridge || {};
window.SmritiBridge.core = window.SmritiBridge.core || {};

window.SmritiBridge.core.createEmptyContext = function () {
  return {
    meta: {
      source_platform: null,
      conversation_url: null,
      extracted_at: new Date().toISOString()
    },

    user_objective: {
      description: "",
      confidence: "low"
    },

    current_status: {
      description: ""
    },

    key_decisions: [],

    user_constraints: [],

    open_questions: [],

    ai_suggested_ideas: [],

    recent_context: []
  };
};
