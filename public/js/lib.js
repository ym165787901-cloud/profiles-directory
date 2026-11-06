/** Tiny DOM builder: el('div', {class:'x', onclick:fn}, child, 'text'). Text is never parsed as HTML. */
export const el = (tag, attrs = {}, ...kids) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.className = value;
    else if (key === 'style') node.style.cssText = value;
    else node.setAttribute(key, value);
  }
  node.append(...kids);
  return node;
};

export const imgUrl = (file) => `/uploads/${encodeURIComponent(file)}`;

/** fetch wrapper: sends cookies, parses JSON, throws Error(message) with .status on failure. */
export async function api(url, options = {}) {
  const res = await fetch(url, { credentials: 'same-origin', ...options });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });
  return data;
}
