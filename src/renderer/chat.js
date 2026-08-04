// Chat panel UI logic

const ChatPanel = {
  open() {
    document.getElementById('chat-panel').classList.remove('hidden');
    document.getElementById('hover-buttons').classList.add('hidden');
    const input = document.getElementById('chat-input');
    setTimeout(() => input.focus(), 50);
  },

  close() {
    document.getElementById('chat-panel').classList.add('hidden');
  },

  addMessage(role, text) {
    const box = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `chat-msg chat-${role}`;
    div.textContent = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  },

  async send() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    this.addMessage('user', text);

    const sendBtn = document.getElementById('btn-chat-send');
    sendBtn.disabled = true;
    try {
      const result = await window.wealthCalendar.chatSend(text);
      this.addMessage('assistant', (result && result.reply) || '…');
    } catch (e) {
      this.addMessage('assistant', '小财卡住了…稍后再试试～');
    } finally {
      sendBtn.disabled = false;
      document.getElementById('chat-input').focus();
    }
  },
};

// Bind events
document.getElementById('btn-close-chat').addEventListener('click', () => ChatPanel.close());

document.getElementById('btn-chat-send').addEventListener('click', () => ChatPanel.send());

document.getElementById('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') ChatPanel.send();
});
