import { $, escapeHtml, showStatus, clearStatus } from './dom.js';
import { state } from './state.js';
import { t, refreshStaticLabels } from './i18n.js';
import { fetchAchievements, ensureCategoryMap } from './api.js';
import { renderRealmDatalist } from './realms.js';
import {
  renderFavorites, updateFavToggle, currentFormFav,
  isFavorite, addFavorite, removeFavorite,
} from './favorites.js';
import { renderSidebar } from './sidebar.js';
import { renderSummaryView, ensureRecentDetails } from './render-summary.js';
import { renderListView, attachAmountObservers } from './render-list.js';
import { renderCharacterView, ensureCharacterData, resetCharacterState } from './render-character.js';
import { initTooltip, hideTip } from './tooltip.js';

const searchBtn  = $('searchBtn');
const cacheBadge = $('cacheBadge');

function collapseForm({ character, realm, region }) {
  $('formCurrent').innerHTML =
    `${escapeHtml(character)}<span class="form-collapsed-meta">· ${escapeHtml(realm)} (${region.toUpperCase()})</span>`;
  $('formExpand').hidden = false;
  $('formCard').classList.add('collapsed');
}
function expandForm() {
  $('formCard').classList.remove('collapsed');
  $('formExpand').hidden = true;
  setTimeout(() => $('character').focus(), 0);
}
$('formExpand').addEventListener('click', expandForm);

// Persist form values across reloads.
['character', 'realm', 'region', 'locale'].forEach(id => {
  const saved = localStorage.getItem('wow_' + id);
  if (saved) $(id).value = saved;
  $(id).addEventListener('change', () => localStorage.setItem('wow_' + id, $(id).value));
});

function renderContent() {
  const content = $('content');
  hideTip();
  if (!state.lastResultsData) { content.innerHTML = ''; return; }

  if (state.currentView === 'character' && !state.searchTerm) {
    content.innerHTML = renderCharacterView();
  } else if (state.currentView === 'summary' && !state.searchTerm) {
    content.innerHTML = renderSummaryView();
    ensureRecentDetails();
  } else {
    content.innerHTML = renderListView();
    attachAmountObservers();
  }

  if (window.$WowheadPower) window.$WowheadPower.refreshLinks();
}

function rerenderResults() {
  if (!state.lastResultsData) return;
  renderSidebar();
  renderContent();
}

async function loadAchievements() {
  const character = $('character').value.trim();
  const realm     = $('realm').value.trim();
  const region    = $('region').value;
  const locale    = $('locale').value;

  if (!character || !realm) {
    showStatus(t().statusFillFields, 'error');
    return;
  }

  localStorage.setItem('wow_character', character);
  localStorage.setItem('wow_realm', realm);

  searchBtn.disabled = true;
  searchBtn.textContent = t().submitLoading;
  showStatus(t().statusLoading, 'loading');
  cacheBadge.textContent = '';
  cacheBadge.className = 'cache-badge';

  try {
    const { ok, status, data, cacheStatus } = await fetchAchievements({ character, realm, region, locale });

    if (cacheStatus) {
      cacheBadge.textContent = cacheStatus === 'HIT' ? t().cacheHit : t().cacheLive;
      cacheBadge.className = 'cache-badge ' + cacheStatus.toLowerCase();
    }

    if (!ok) {
      const errMsg = data.error || `${t().statusError} ${status}`;
      const userMsg = status === 404 ? t().statusNotFound(character, realm) : errMsg;
      showStatus(userMsg, 'error');
      return;
    }

    state.lastResultsData = data;
    state.currentView = 'summary';
    state.currentFilter = 'all';
    state.searchTerm = '';
    resetCharacterState();
    $('searchInput').value = '';
    $('window-wrap').style.display = 'block';
    $('pointsValue').textContent = (data.total_points ?? 0).toLocaleString(t().dateLocale);

    // Background-fetch the full category tree; sidebar + progress refine when it lands.
    ensureCategoryMap().then(() => {
      renderSidebar();
      renderContent();
    }).catch(() => {});

    renderSidebar();
    renderContent();
    updateFavToggle();
    collapseForm({ character, realm, region });
    clearStatus();
  } catch (err) {
    showStatus(t().statusConn + err.message, 'error');
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = t().submit;
  }
}

function pickFavorite(f) {
  const regionChanged = $('region').value !== f.region;
  $('character').value = f.character;
  $('realm').value = f.realm;
  $('region').value = f.region;
  localStorage.setItem('wow_character', f.character);
  localStorage.setItem('wow_realm', f.realm);
  localStorage.setItem('wow_region', f.region);
  if (regionChanged) {
    state.currentView = 'summary';
    state.categoryData = null;
    renderRealmDatalist();
  }
  loadAchievements();
}

// Region / locale dropdown wiring.
$('region').addEventListener('change', () => {
  renderRealmDatalist();
  state.currentView = 'summary';
  state.categoryData = null;
  resetCharacterState();
  rerenderResults();
});
$('locale').addEventListener('change', () => {
  renderRealmDatalist();
  refreshStaticLabels();
  updateFavToggle();
  resetCharacterState();
  rerenderResults();
});
renderRealmDatalist();

// Favorites bar + toggle button.
renderFavorites({ onPick: pickFavorite });
$('favToggle').addEventListener('click', () => {
  const f = currentFormFav();
  if (!f.character || !f.realm) return;
  if (isFavorite(f)) {
    if (!confirm(t().favRemoveConfirm(f))) return;
    removeFavorite(f);
  } else {
    addFavorite(f);
  }
  renderFavorites({ onPick: pickFavorite });
  updateFavToggle();
});

// Initial labels + fav toggle state.
refreshStaticLabels();
updateFavToggle();

// Search button + Enter key.
searchBtn.addEventListener('click', loadAchievements);
$('character').addEventListener('keydown', e => { if (e.key === 'Enter') loadAchievements(); });
$('realm').addEventListener('keydown', e => { if (e.key === 'Enter') loadAchievements(); });

// Live search inside the achievement window.
$('searchInput').addEventListener('input', e => {
  state.searchTerm = e.target.value.toLowerCase().trim();
  renderContent();
});

// Filter buttons (delegated).
$('content').addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  state.currentFilter = btn.dataset.filter;
  renderContent();
});

// Sidebar navigation.
$('sidebar').addEventListener('click', e => {
  const item = e.target.closest('.sidebar-item, .sidebar-subitem');
  if (!item) return;
  if (item.dataset.view === 'summary') {
    state.currentView = 'summary';
  } else if (item.dataset.view === 'character') {
    state.currentView = 'character';
    ensureCharacterData(() => { renderSidebar(); renderContent(); });
  } else if (item.dataset.catId) {
    state.currentView = parseInt(item.dataset.catId, 10);
    if (!state.categoryData) {
      showStatus(t().categoryLoading, 'loading');
      ensureCategoryMap()
        .then(() => { clearStatus(); renderSidebar(); renderContent(); })
        .catch(err => showStatus(t().categoryFail + err.message, 'error'));
    }
  }
  renderSidebar();
  renderContent();
});

// Hover tooltips for in-progress achievements + per-root progress bars.
initTooltip();
