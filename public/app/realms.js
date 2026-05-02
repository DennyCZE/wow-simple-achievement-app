import { $, escapeHtml } from './dom.js';
import { loadRealms } from './api.js';

export async function renderRealmDatalist() {
  const realms = await loadRealms($('region').value, $('locale').value);
  $('realm-history').innerHTML = realms
    .map(r => `<option value="${escapeHtml(r.name)}">`)
    .join('');
}
