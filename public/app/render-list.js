import { escapeHtml, formatDate } from './dom.js';
import { state } from './state.js';
import { t } from './i18n.js';
import { getAchievementDetail, getCachedAchievementDetail } from './api.js';

// Two flavours: 'criteria' (count completed children of total children) and
// 'amount' (numeric counter — honor kills, gold looted, rep earned — where the
// running total comes from the character payload and the target needs an extra
// detail fetch). Single-child achievements with an amount are counters, not
// 1-of-1 checklists, so they get amount-style too.
function criteriaProgress(a) {
  const c = a.criteria;
  if (!c || a.completed_timestamp) return null;
  const kids = Array.isArray(c.child_criteria) ? c.child_criteria : null;

  // Multiple children → completed-count style.
  if (kids && kids.length > 1) {
    const total = kids.length;
    const done = kids.reduce((n, k) => n + (k.is_completed ? 1 : 0), 0);
    return { kind: 'criteria', done, total };
  }

  // Single child with amount, OR root-only criterion with amount → counter.
  const counter = (kids && kids.length === 1 && typeof kids[0].amount === 'number' && kids[0].amount > 0)
    ? kids[0]
    : (typeof c.amount === 'number' && c.amount > 0 ? c : null);
  if (counter) {
    const cached = getCachedAchievementDetail(a.id);
    // Target lives on the static achievement detail — might be on root criteria
    // or its single child, depending on how the achievement is modelled upstream.
    const target = cached?.criteria?.amount
                || cached?.criteria?.child_criteria?.[0]?.amount;
    return target && target > 0
      ? { kind: 'amount', done: counter.amount, total: target }
      : { kind: 'amount', done: counter.amount, total: null };
  }
  return null;
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

  const fmtN = n => Number(n).toLocaleString(_.dateLocale);

  const listHtml = items.map(a => {
    let progressHtml = '';
    if (a.progress) {
      const p = a.progress;
      const pct = (p.total != null && p.total > 0) ? Math.min(100, (p.done / p.total) * 100) : 0;
      const text = p.total != null ? `${fmtN(p.done)} / ${fmtN(p.total)}` : fmtN(p.done);
      const lazyAttr = (p.kind === 'amount' && p.total == null)
        ? ` data-amount-current="${p.done}"`
        : '';
      progressHtml = `
        <div class="ach-progress" data-tip-ach="${a.id}"${lazyAttr} tabindex="0">
          <div class="ach-progress-bar"><div class="ach-progress-fill" style="width: ${pct.toFixed(2)}%"></div></div>
          <div class="ach-progress-text">${text}</div>
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

// Lazy-fetch the achievement target for amount-style rows when they scroll
// into view. Keeps API traffic low — only rows the user actually looks at
// trigger a request, and the in-memory + server caches dedupe everything.
let amountObserver = null;

function patchAmountRow(el) {
  const id = parseInt(el.dataset.tipAch, 10);
  if (!id) return;
  const current = parseInt(el.dataset.amountCurrent, 10);
  if (!Number.isFinite(current)) return;
  getAchievementDetail(id).then(detail => {
    const target = detail?.criteria?.amount
                || detail?.criteria?.child_criteria?.[0]?.amount;
    if (!target || target <= 0) return;
    const pct  = Math.min(100, (current / target) * 100);
    const fmtN = n => Number(n).toLocaleString(t().dateLocale);
    const fill = el.querySelector('.ach-progress-fill');
    const text = el.querySelector('.ach-progress-text');
    if (fill) fill.style.width = `${pct.toFixed(2)}%`;
    if (text) text.textContent = `${fmtN(current)} / ${fmtN(target)}`;
    delete el.dataset.amountCurrent;
  });
}

export function attachAmountObservers() {
  const rows = document.querySelectorAll('.ach-progress[data-amount-current]');
  if (rows.length === 0) return;
  if (!amountObserver) {
    amountObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        amountObserver.unobserve(entry.target);
        patchAmountRow(entry.target);
      }
    }, { rootMargin: '200px 0px' });
  }
  rows.forEach(el => amountObserver.observe(el));
}
