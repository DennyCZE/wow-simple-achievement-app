import { $, escapeHtml } from './dom.js';
import { state } from './state.js';
import { t } from './i18n.js';

export function renderSidebar() {
  const _ = t();
  const sidebar = $('sidebar');
  const cd = state.categoryData;
  let html =
      `<div class="sidebar-item${state.currentView === 'summary' ? ' active' : ''}" data-view="summary">${escapeHtml(_.summaryView)}</div>`
    + `<div class="sidebar-item${state.currentView === 'character' ? ' active' : ''}" data-view="character">${escapeHtml(_.characterView)}</div>`;

  if (cd?.root_ids?.length) {
    for (const rootId of cd.root_ids) {
      const cat = cd.categories[String(rootId)];
      if (!cat) continue;
      const subs = (cat.subcategory_ids || [])
        .map(id => ({ id, ...(cd.categories[String(id)] || {}) }))
        .filter(s => s.name);
      const isActiveRoot = state.currentView === rootId;
      const isActiveSub = subs.some(s => state.currentView === s.id);

      if (subs.length === 0) {
        html += `<div class="sidebar-item${isActiveRoot ? ' active' : ''}" data-cat-id="${rootId}">${escapeHtml(cat.name)}</div>`;
      } else {
        html += `<details class="sidebar-group"${isActiveRoot || isActiveSub ? ' open' : ''}>`
              + `<summary class="sidebar-item${isActiveRoot ? ' active' : ''}" data-cat-id="${rootId}">${escapeHtml(cat.name)}</summary>`
              + `<div class="sidebar-subs">`
              + subs.map(sub => `<div class="sidebar-subitem${state.currentView === sub.id ? ' active' : ''}" data-cat-id="${sub.id}">${escapeHtml(sub.name)}</div>`).join('')
              + `</div></details>`;
      }
    }
  } else if (state.lastResultsData) {
    // Fallback while the full category tree is still loading.
    const seen = new Set();
    for (const c of (state.lastResultsData.category_progress || [])) {
      const id = c.category?.id;
      const name = c.category?.name;
      if (!id || !name || seen.has(id)) continue;
      seen.add(id);
      html += `<div class="sidebar-item${state.currentView === id ? ' active' : ''}" data-cat-id="${id}">${escapeHtml(name)}</div>`;
    }
  }

  sidebar.innerHTML = html;
}
