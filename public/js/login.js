import { api } from './lib.js';

const form = document.getElementById('login');
const error = document.getElementById('err');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.textContent = '';
  try {
    await api('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    location.href = '/admin';
  } catch (err) {
    error.textContent = err.message;
  }
});
