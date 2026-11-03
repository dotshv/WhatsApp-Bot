/**
 * In-memory wizard state manager for Telegram conversational flows
 */

class WizardStateManager {
  constructor() {
    this.states = new Map(); // chatId -> stateObj
  }

  set(chatId, stateName, data = {}) {
    this.states.set(String(chatId), {
      state: stateName,
      data,
      updatedAt: Date.now()
    });
  }

  get(chatId) {
    return this.states.get(String(chatId)) || null;
  }

  updateData(chatId, partialData) {
    const current = this.get(chatId);
    if (current) {
      current.data = { ...current.data, ...partialData };
      current.updatedAt = Date.now();
      this.states.set(String(chatId), current);
    }
  }

  clear(chatId) {
    this.states.delete(String(chatId));
  }

  has(chatId) {
    return this.states.has(String(chatId));
  }
}

const wizardState = new WizardStateManager();
module.exports = wizardState;

