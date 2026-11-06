import { el, api } from './lib.js';
import { profileCard, galleryTile, renderList } from './components.js';

const $ = (id) => document.getElementById(id);

function toast(message, type = '') {
  const node = el('div', { class: `toast ${type}` }, message);
  $('toasts').append(node);
  setTimeout(() => node.remove(), 3200);
}

function handleError(err) {
  if (err.status === 401) location.href = '/login.html'; // session expired
  else toast(err.message, 'error');
}

/** Wires one form + one list to a REST endpoint. Profiles and gallery both reuse it. */
function createManager({ endpoint, form, list, empty, renderItem, toRequests }) {
  const refresh = async () => {
    try {
      const items = await api(endpoint);
      renderList(list, items, (item, i) => renderItem(item, i, remove), empty);
    } catch (err) { handleError(err); }
  };

  const remove = async (item) => {
    if (!confirm('Delete this item permanently?')) return;
    try {
      await api(`${endpoint}/${item.id}`, { method: 'DELETE' });
      toast('Deleted');
      await refresh();
    } catch (err) { handleError(err); }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;
    try {
      for (const body of toRequests(form)) await api(endpoint, { method: 'POST', body });
      form.reset();
      toast('Saved');
      await refresh();
    } catch (err) { handleError(err); }
    finally { submit.disabled = false; }
  });

  return refresh();
}

createManager({
  endpoint: '/api/profiles',
  form: $('profileForm'),
  list: $('profileList'),
  empty: 'No profiles yet. Add the first one above.',
  renderItem: (profile, i, onDelete) => profileCard(profile, i, onDelete),
  toRequests: (form) => [new FormData(form)],
});

createManager({
  endpoint: '/api/gallery',
  form: $('galleryForm'),
  list: $('galleryList'),
  empty: 'No images yet. Upload some above.',
  renderItem: (image, i, onDelete) => galleryTile(image, i, { onDelete }),
  // One request per file keeps the server route simple and validates each image.
  toRequests: (form) => [...form.elements.image.files].map((file) => {
    const data = new FormData();
    data.append('image', file);
    return data;
  }),
});

$('logout').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  location.href = '/login.html';
});
