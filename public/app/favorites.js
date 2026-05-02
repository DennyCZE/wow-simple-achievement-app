import { $, escapeHtml } from './dom.js';
import { t } from './i18n.js';

const FAV_KEY = 'wow_favorites';

const sameFav = (a, b) =>
  a.character.toLowerCase() === b.character.toLowerCase() &&
  a.realm.toLowerCase() === b.realm.toLowerCase() &&
  a.region === b.region;

function read() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); }
  catch { return []; }
}
function write(favs) { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); }

export const isFavorite = f => read().some(x => sameFav(x, f));

export function addFavorite(f) {
  const favs = read();
  if (!favs.some(x => sameFav(x, f))) {
    favs.unshift(f);
    write(favs);
  }
}

export function removeFavorite(f) {
  write(read().filter(x => !sameFav(x, f)));
}

export function currentFormFav() {
  return {
    character: $('character').value.trim(),
    realm: $('realm').value.trim(),
    region: $('region').value,
  };
}

export function renderFavorites({ onPick }) {
  const favs = read();
  const wrap = $('favorites');
  if (favs.length === 0) {
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    return;
  }
  wrap.style.display = 'flex';
  const aria = t().favRemoveAria;
  wrap.innerHTML = favs.map((f, i) => `
    <div class="fav-chip" data-idx="${i}">
      <span class="fav-chip-name">${escapeHtml(f.character)}</span>
      <span class="fav-chip-meta">· ${escapeHtml(f.realm)} (${f.region})</span>
      <button class="fav-chip-remove" data-idx="${i}" aria-label="${aria}">×</button>
    </div>
  `).join('');

  wrap.querySelectorAll('.fav-chip').forEach(chip => {
    chip.addEventListener('click', e => {
      if (e.target.classList.contains('fav-chip-remove')) return;
      const f = read()[parseInt(chip.dataset.idx, 10)];
      if (f) onPick(f);
    });
  });
  wrap.querySelectorAll('.fav-chip-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const f = read()[parseInt(btn.dataset.idx, 10)];
      if (!f) return;
      removeFavorite(f);
      renderFavorites({ onPick });
      updateFavToggle();
    });
  });
}

export function updateFavToggle() {
  const f = currentFormFav();
  const btn = $('favToggle');
  if (!f.character || !f.realm) { btn.hidden = true; return; }
  btn.hidden = false;
  if (isFavorite(f)) {
    btn.classList.add('is-fav');
    btn.textContent = t().favRemove;
  } else {
    btn.classList.remove('is-fav');
    btn.textContent = t().favAdd;
  }
}
