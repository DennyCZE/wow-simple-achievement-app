import { escapeHtml, formatDate } from './dom.js';
import { state } from './state.js';
import { t } from './i18n.js';
import { collectAchievementIds } from './category-tree.js';
import { getAchievementDetail, getCachedAchievementDetail } from './api.js';

const recentOf = data => (data?.achievements || [])
  .filter(a => a.completed_timestamp)
  .sort((a, b) => b.completed_timestamp - a.completed_timestamp)
  .slice(0, 4);

export function renderSummaryView() {
  const _ = t();
  const data = state.lastResultsData;
  const cd = state.categoryData;

  const recent = recentOf(data);

  const recentHtml = recent.map(a => {
    const id = a.id;
    const name = a.achievement?.name || `#${id}`;
    const cached = getCachedAchievementDetail(id);
    const pts = cached?.points;
    const iconHtml = cached?.icon_url
      ? `<img src="${escapeHtml(cached.icon_url)}" alt="" loading="lazy">`
      : '⚔';
    const pointsHtml = pts != null
      ? `<div class="recent-points" data-ach-id="${id}">${pts}</div>`
      : `<div class="recent-points pending" data-ach-id="${id}">·</div>`;
    return `
      <div class="recent-item">
        <div class="recent-icon" data-ach-id="${id}">${iconHtml}</div>
        <div class="recent-body">
          <a class="recent-name" href="https://www.wowhead.com/achievement=${id}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)}</a>
        </div>
        <div class="recent-date">${formatDate(a.completed_timestamp, _.dateLocale)}</div>
        ${pointsHtml}
      </div>
    `;
  }).join('');

  const completedIds = new Set(
    (data.achievements || [])
      .filter(a => a.completed_timestamp)
      .map(a => a.id)
  );

  // Build per-root rollups when the category map is loaded; otherwise fall
  // back to the flat list from the API so the summary still renders.
  let rows = [];
  let totalCompleted = data.total_quantity ?? 0;
  let totalPossible = null;

  if (cd?.root_ids?.length) {
    const allIds = new Set();
    rows = cd.root_ids.map(rootId => {
      const cat = cd.categories[String(rootId)];
      if (!cat) return null;
      const ids = collectAchievementIds(rootId);
      ids.forEach(x => allIds.add(x));
      let completed = 0;
      ids.forEach(x => { if (completedIds.has(x)) completed++; });
      return { id: rootId, name: cat.name, completed, possible: ids.size };
    }).filter(Boolean);
    totalCompleted = 0;
    allIds.forEach(x => { if (completedIds.has(x)) totalCompleted++; });
    totalPossible = allIds.size || null;
  } else {
    rows = (data.category_progress || [])
      .slice()
      .sort((a, b) => (b.quantity || 0) - (a.quantity || 0))
      .map(c => ({
        id: c.category?.id ?? null,
        name: c.category?.name || '—',
        completed: c.quantity ?? 0,
        possible: null,
      }));
  }

  const fmt = n => Number(n).toLocaleString(_.dateLocale);
  const pct = (c, p) => (p && p > 0) ? Math.min(100, (c / p) * 100) : (c > 0 ? 100 : 0);

  const hasMap = !!cd?.root_ids?.length;
  const progressHtml = rows.map(r => {
    const value = r.possible != null ? `${fmt(r.completed)}/${fmt(r.possible)}` : fmt(r.completed);
    const fill = pct(r.completed, r.possible);
    const tipAttr = hasMap && r.id != null ? ` data-tip-cat="${r.id}"` : '';
    return `
      <div class="progress-item"${tipAttr}>
        <div class="progress-fill" style="width: ${fill.toFixed(2)}%"></div>
        <span class="progress-item-name">${escapeHtml(r.name)}</span>
        <span class="progress-item-value">${value}</span>
      </div>
    `;
  }).join('');

  const totalValue = totalPossible != null ? `${fmt(totalCompleted)}/${fmt(totalPossible)}` : fmt(totalCompleted);
  const totalFill = pct(totalCompleted, totalPossible);

  const recentBlock = recent.length ? `
    <h3 class="banner">${escapeHtml(_.recentTitle)}</h3>
    <div class="recent-list">${recentHtml}</div>
  ` : '';

  return `
    ${recentBlock}
    <h3 class="banner">${escapeHtml(_.progressTitle)}</h3>
    <div class="progress-total">
      <div class="progress-fill" style="width: ${totalFill.toFixed(2)}%"></div>
      <span class="progress-total-label">${escapeHtml(_.totalEarned)}</span>
      <span class="progress-total-value">${totalValue}</span>
    </div>
    <div class="progress-grid">${progressHtml}</div>
  `;
}

// Lazy-fetch detail (points + icon URL) for the 4 recent rows, then patch
// the placeholders in place. Avoids re-rendering the whole summary just
// to fill in numbers and images.
export async function ensureRecentDetails() {
  const recent = recentOf(state.lastResultsData);
  if (recent.length === 0) return;

  await Promise.all(recent.map(async a => {
    if (getCachedAchievementDetail(a.id)) return;
    await getAchievementDetail(a.id);
  }));

  for (const a of recent) {
    const detail = getCachedAchievementDetail(a.id);
    if (!detail) continue;

    if (detail.icon_url) {
      const iconEl = document.querySelector(`.recent-icon[data-ach-id="${a.id}"]`);
      if (iconEl && !iconEl.querySelector('img')) {
        iconEl.innerHTML = `<img src="${escapeHtml(detail.icon_url)}" alt="" loading="lazy">`;
      }
    }
    if (detail.points != null) {
      const ptsEl = document.querySelector(`.recent-points.pending[data-ach-id="${a.id}"]`);
      if (ptsEl) {
        ptsEl.textContent = detail.points;
        ptsEl.classList.remove('pending');
      }
    }
  }
}
