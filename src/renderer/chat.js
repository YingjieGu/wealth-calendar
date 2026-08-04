// Chat panel UI logic (text + voice)

const ChatPanel = {
  open() {
    document.getElementById('chat-panel').classList.remove('hidden');
    document.getElementById('hover-buttons').classList.add('hidden');
    const input = document.getElementById('chat-input');
    setTimeout(() => input.focus(), 50);
  },

  close() {
    document.getElementById('chat-panel').classList.add('hidden');
    // Restore hover buttons (open() hid them)
    document.getElementById('hover-buttons').classList.remove('hidden');
  },

  addMessage(role, text) {
    const box = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `chat-msg chat-${role}`;
    div.textContent = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  },

  async send(text) {
    const input = document.getElementById('chat-input');
    const message = (text !== undefined) ? text : input.value.trim();
    if (!message) return;
    if (text === undefined) input.value = '';
    this.addMessage('user', message);

    const sendBtn = document.getElementById('btn-chat-send');
    sendBtn.disabled = true;
    try {
      const result = await window.wealthCalendar.chatSend(message);
      const reply = (result && result.reply) || '…';
      this.addMessage('assistant', reply);
      this.speak(reply);
    } catch (e) {
      this.addMessage('assistant', '小财卡住了…稍后再试试～');
    } finally {
      sendBtn.disabled = false;
      document.getElementById('chat-input').focus();
    }
  },

  // ---- Voice output ----
  async speak(text) {
    try {
      const settings = await window.wealthCalendar.loadSettings();
      if (settings.ttsEnabled === false) return;
      const r = await window.wealthCalendar.ttsSynthesize(text);
      if (r && r.audioBase64) {
        const audio = new Audio(`data:audio/mpeg;base64,${r.audioBase64}`);
        audio.play().catch(() => { /* autoplay ok inside user gesture chain */ });
      }
    } catch (e) { /* TTS failure is non-fatal */ }
  },

  // ---- Voice input (mic -> ASR -> chat) ----
  async toggleMic() {
    const btn = document.getElementById('btn-chat-mic');
    if (this._recorder) {
      // stop recording
      this._recorder.stop();
      btn.textContent = '🎤';
      btn.classList.remove('recording');
      this._recorder = null;
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        btn.textContent = '🎤';
        btn.classList.remove('recording');
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const arrayBuf = await blob.arrayBuffer();
        const r = await window.wealthCalendar.asrTranscribe(arrayBuf, 'zh');
        const text = r && r.text ? r.text.trim() : '';
        if (text) {
          this.addMessage('user', `🎤 ${text}`);
          await this.send(text);
        } else {
          this.addMessage('assistant', '小财没听清呢，再说一次好不好～');
        }
      };
      recorder.start();
      this._recorder = recorder;
      btn.textContent = '⏹';
      btn.classList.add('recording');
      this.addMessage('assistant', '🎙️ 我在听…（再点一次结束）');
    } catch (e) {
      this.addMessage('assistant', '无法访问麦克风：' + e.message);
    }
  },
};

// Bind events
document.getElementById('btn-close-chat').addEventListener('click', () => ChatPanel.close());

document.getElementById('btn-chat-send').addEventListener('click', () => ChatPanel.send());

document.getElementById('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') ChatPanel.send();
});

document.getElementById('btn-chat-mic').addEventListener('click', () => ChatPanel.toggleMic());
