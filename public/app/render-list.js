import { escapeHtml, formatDate } from './dom.js';
import { state } from './state.js';
import { t } from './i18n.js';

function criteriaProgress(a) {
  const c = a.criteria;
  if (!c || a.completed_timestamp) return null;
  const kids = Array.isArray(c.child_criteria) ? c.child_criteria : null;
  if (!kids || kids.length === 0) return null;
  const total = kids.length;
  const done = kids.reduce((n, k) => n + (k.is_completed ? 1 : 0), 0);
  return { done, total };
}

// Capture per-criterion done state so the hover tooltip can mark each item.
function recordChildState(a) {
  const kids = a.criteria?.child_criteria;
  if (!Array.isArray(kids) || kids.length === 0) return;
  const m = new Map();
  for (const k of kids) {
    if (typeof k.id === 'number') m.set(k.id, !!k.is_completed);
  }
  state.childStateById[a.id] = m;
}

export function renderListView() {
  const _ = t();
  const allAch = (state.lastResultsData.achievements || []).map(a => {
    recordChildState(a);
    return {
      id: a.id,
      name: a.achievement?.name || `#${a.id}`,
      completedAt: a.completed_timestamp || null,
      progress: criteriaProgress(a),
    };
  });

  let items = allAch;
  let title = '';

  if (typeof state.currentView === 'number' && state.categoryData?.categories?.[String(state.currentView)]) {
    const cat = state.categoryData.categories[String(state.currentView)];
    title = cat.name;
    const allowed = new Set(cat.achievement_ids);
    items = items.filter(a => allowed.has(a.id));
  } else if (typeof state.currentView === 'number') {
    const c = state.lastResultsData.category_progress?.find(p => p.category?.id === state.currentView);
    title = c?.category?.name || '';
  } else if (state.currentView === 'summary' && state.searchTerm) {
    title = _.searchResults;
  }

  if (state.currentFilter === 'completed') items = items.filter(a => a.completedAt);
  else if (state.currentFilter === 'incomplete') items = items.filter(a => !a.completedAt);

  if (state.searchTerm) items = items.filter(a => a.name.toLowerCase().includes(state.searchTerm));

  const sortLocale = _.sortLocale;
  items.sort((a, b) => {
    if (a.completedAt && b.completedAt) return b.completedAt - a.completedAt;
    if (a.completedAt) return -1;
    if (b.completedAt) return 1;
    return a.name.localeCompare(b.name, sortLocale);
  });

  const filtersHtml = `
    <div class="filters">
      <button class="filter-btn${state.currentFilter === 'all' ? ' active' : ''}" data-filter="all">${_.filterAll}</button>
      <button class="filter-btn${state.currentFilter === 'completed' ? ' active' : ''}" data-filter="completed">${_.filterCompleted}</button>
      <button class="filter-btn${state.currentFilter === 'incomplete' ? ' active' : ''}" data-filter="incomplete">${_.filterIncomplete}</button>
    </div>
  `;
  const banner = title ? `<h3 class="banner">${escapeHtml(title)}</h3>` : '';

  if (items.length === 0) {
    return `${banner}${filtersHtml}<div class="status empty">${escapeHtml(_.empty)}</div>`;
  }

  const listHtml = items.map(a => {
    let progressHtml = '';
    if (a.progress) {
      const pct = (a.progress.done / a.progress.total) * 100;
      progressHtml = `
        <div class="ach-progress" data-tip-ach="${a.id}" tabindex="0">
          <div class="ach-progress-bar"><div class="ach-progress-fill" style="width: ${pct.toFixed(2)}%"></div></div>
          <div class="ach-progress-text">${a.progress.done} / ${a.progress.total}</div>
        </div>
      `;
    }
    return `
      <div class="ach-item ${a.completedAt ? 'completed' : 'incomplete'}">
        <div class="ach-icon">⚔</div>
        <div>
          <a class="ach-name" href="https://www.wowhead.com/achievement=${a.id}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.name)}</a>
          <span class="ach-id">#${a.id}</span>
          ${progressHtml}
        </div>
        <div class="ach-date">${a.completedAt ? formatDate(a.completedAt, _.dateLocale) : '—'}</div>
      </div>
    `;
  }).join('');

  return `${banner}${filtersHtml}<div class="ach-list">${listHtml}</div>`;
}
