export const $ = id => document.getElementById(id);

export const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

export const formatDate = (ts, locale) =>
  new Date(ts).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });

export function showStatus(msg, type) {
  $('status').innerHTML = `<div class="status ${type}">${escapeHtml(msg)}</div>`;
}

export function clearStatus() { $('status').innerHTML = ''; }
