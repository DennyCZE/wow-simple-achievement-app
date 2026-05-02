import { $, escapeHtml } from './dom.js';
import { state } from './state.js';
import { t } from './i18n.js';
import { getAchievementDetail } from './api.js';
import { collectAchievementIds } from './category-tree.js';

let tipEl = null;
let tipKey = null;          // "ach:<id>" or "cat:<id>"

function positionTip(row) {
  const r    = row.getBoundingClientRect();
  const tipW = tipEl.offsetWidth;
  const tipH = tipEl.offsetHeight;
  const vpW  = document.documentElement.clientWidth;
  const vpH  = window.innerHeight;
  const gap  = 6;

  const spaceBelow = vpH - r.bottom;
  const spaceAbove = r.top;
  const flipUp = spaceBelow < tipH + gap && spaceAbove > spaceBelow;

  const top  = flipUp
    ? window.scrollY + r.top - tipH - gap
    : window.scrollY + r.bottom + gap;
  const maxLeft = window.scrollX + vpW - tipW - 8;
  const left = Math.max(8, Math.min(window.scrollX + r.left, maxLeft));

  tipEl.style.top  = top + 'px';
  tipEl.style.left = left + 'px';
}

function renderAchTipBody(id, detail) {
  const _ = t();
  const stateMap = state.childStateById[id];
  if (!detail) return `<div class="ach-tip-error">${escapeHtml(_.tipError)}</div>`;
  const kids = detail.criteria?.child_criteria || [];
  if (!kids.length || !stateMap) {
    const summary = detail.criteria?.description || detail.description || '';
    return `
      <div class="ach-tip-title">${escapeHtml(detail.name || `#${id}`)}</div>
      ${summary ? `<div class="ach-tip-summary">${escapeHtml(summary)}</div>` : ''}
      <div class="ach-tip-empty">${escapeHtml(_.tipNoCriteria)}</div>
    `;
  }
  const done  = kids.filter(k => stateMap.get(k.id)).length;
  const total = kids.length;
  const list = kids.map(k => {
    const isDone = !!stateMap.get(k.id);
    const label  = k.description || `#${k.id}`;
    return `
      <li class="${isDone ? 'done' : 'todo'}">
        <span class="ach-tip-mark">${isDone ? '✓' : '◯'}</span>
        <span>${escapeHtml(label)}</span>
      </li>
    `;
  }).join('');
  return `
    <div class="ach-tip-title">${escapeHtml(detail.name || `#${id}`)}</div>
    <div class="ach-tip-summary">${done} / ${total}</div>
    <ul class="ach-tip-list">${list}</ul>
  `;
}

function renderCatTipBody(catId) {
  const _ = t();
  const cd = state.categoryData;
  const cat = cd?.categories?.[String(catId)];
  if (!cat) return null;

  const completed = new Set(
    (state.lastResultsData?.achievements || [])
      .filter(a => a.completed_timestamp)
      .map(a => a.id)
  );
  const totalIds = collectAchievementIds(catId);
  let totalDone = 0;
  totalIds.forEach(x => { if (completed.has(x)) totalDone++; });
  const totalCount = totalIds.size;
  const totalPct = totalCount > 0 ? (totalDone / totalCount) * 100 : 0;

  const subs = (cat.subcategory_ids || [])
    .map(sid => {
      const sc = cd.categories[String(sid)];
      if (!sc) return null;
      const ids = collectAchievementIds(sid);
      if (ids.size === 0) return null;
      let done = 0;
      ids.forEach(x => { if (completed.has(x)) done++; });
      return { name: sc.name, done, total: ids.size };
    })
    .filter(Boolean);

  const fmtN = n => Number(n).toLocaleString(_.dateLocale);
  const headerSub = `${fmtN(totalDone)} / ${fmtN(totalCount)} · ${totalPct.toFixed(0)}%`;

  if (subs.length === 0) {
    return `
      <div class="ach-tip-title">${escapeHtml(cat.name)}</div>
      <div class="ach-tip-summary">${escapeHtml(headerSub)}</div>
    `;
  }
  const list = subs.map(s => {
    const sp = s.total > 0 ? (s.done / s.total) * 100 : 0;
    return `
      <li class="prog-tip-row">
        <div class="prog-tip-head">
          <span class="prog-tip-count">${fmtN(s.done)}/${fmtN(s.total)}</span>
          <span class="prog-tip-label">${escapeHtml(s.name)}</span>
        </div>
        <span class="prog-tip-bar"><span class="prog-tip-fill" style="width: ${sp.toFixed(2)}%"></span></span>
      </li>
    `;
  }).join('');
  return `
    <div class="ach-tip-title">${escapeHtml(cat.name)}</div>
    <div class="ach-tip-summary">${escapeHtml(headerSub)}</div>
    <ul class="prog-tip-list">${list}</ul>
  `;
}

function showAchTip(row) {
  const id = parseInt(row.dataset.tipAch, 10);
  if (!id) return;
  tipKey = 'ach:' + id;
  tipEl.hidden = false;
  tipEl.classList.remove('visible');
  tipEl.innerHTML = `<div class="ach-tip-loading">${escapeHtml(t().tipLoading)}</div>`;
  positionTip(row);
  requestAnimationFrame(() => tipEl.classList.add('visible'));
  getAchievementDetail(id).then(detail => {
    if (tipKey !== 'ach:' + id || tipEl.hidden) return;
    tipEl.innerHTML = renderAchTipBody(id, detail);
    positionTip(row);
  });
}

function showCatTip(row) {
  const id = parseInt(row.dataset.tipCat, 10);
  if (!id) return;
  const html = renderCatTipBody(id);
  if (!html) return;
  tipKey = 'cat:' + id;
  tipEl.hidden = false;
  tipEl.classList.remove('visible');
  tipEl.innerHTML = html;
  positionTip(row);
  requestAnimationFrame(() => tipEl.classList.add('visible'));
}

export function hideTip() {
  tipKey = null;
  if (!tipEl) return;
  tipEl.classList.remove('visible');
  tipEl.hidden = true;
  tipEl.innerHTML = '';
}

export function initTooltip() {
  tipEl = $('achTip');

  $('content').addEventListener('mouseover', e => {
    const achEl = e.target.closest('.ach-progress[data-tip-ach]');
    if (achEl) {
      if (tipKey === 'ach:' + achEl.dataset.tipAch) return;
      showAchTip(achEl);
      return;
    }
    const catRow = e.target.closest('.progress-item[data-tip-cat]');
    if (catRow) {
      if (tipKey === 'cat:' + catRow.dataset.tipCat) return;
      showCatTip(catRow);
    }
  });
  $('content').addEventListener('mouseout', e => {
    const row = e.target.closest('.ach-progress[data-tip-ach], .progress-item[data-tip-cat]');
    if (!row) return;
    const next = e.relatedTarget;
    if (next && row.contains(next)) return;
    hideTip();
  });
  window.addEventListener('scroll', hideTip, { passive: true });
}
