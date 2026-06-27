class ModalService {
  static bind(app) {
    document.getElementById('promptCancel').addEventListener('click', () => {
      this.closePrompt(app, null);
    });
    document.getElementById('promptConfirm').addEventListener('click', () => {
      this.executePrompt(app);
    });
    document.getElementById('promptInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.executePrompt(app);
      }
    });
    document.getElementById('promptModal').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) {
        this.closePrompt(app, null);
      }
    });
    document.getElementById('infoOk').addEventListener('click', () => {
      this.closeInfo();
    });
    document.getElementById('infoModal').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) {
        this.closeInfo();
      }
    });
  }

  static showPrompt(app, { title, message = '', defaultValue = '', placeholder = '' }) {
    return new Promise((resolve) => {
      app.promptResolve = resolve;
      document.getElementById('promptTitle').textContent = title;
      document.getElementById('promptMessage').textContent = message;
      const input = document.getElementById('promptInput');
      input.value = defaultValue;
      input.placeholder = placeholder;
      document.getElementById('promptModal').classList.remove('hidden');
      setTimeout(() => {
        input.focus();
        input.select();
      }, 0);
    });
  }

  static closePrompt(app, value) {
    document.getElementById('promptModal').classList.add('hidden');
    if (app.promptResolve) {
      app.promptResolve(value);
      app.promptResolve = null;
    }
  }

  static executePrompt(app) {
    const value = document.getElementById('promptInput').value;
    this.closePrompt(app, value);
  }

  static showInfo(title, message) {
    document.getElementById('infoTitle').textContent = title;
    document.getElementById('infoMessage').textContent = message;
    document.getElementById('infoModal').classList.remove('hidden');
  }

  static closeInfo() {
    document.getElementById('infoModal').classList.add('hidden');
  }
}

export default ModalService;
