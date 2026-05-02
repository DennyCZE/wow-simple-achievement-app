import { $ } from './dom.js';
import { state } from './state.js';

const API_URL = 'api.php';

// Character achievement summary — primary fetch behind the search button.
export async function fetchAchievements({ character, realm, region, locale }) {
  const params = new URLSearchParams({ character, realm, region, locale });
  const res = await fetch(`${API_URL}?${params}`);
  const data = await res.json();
  return {
    ok: res.ok,
    status: res.status,
    data,
    cacheStatus: res.headers.get('X-Cache'),
  };
}

// Realm autocomplete — cached in localStorage for 7 days per region.
const REALM_CACHE_PREFIX = 'wow_realms:';
const REALM_CACHE_TTL = 7 * 86400 * 1000;
const realmsByRegion = {};

export async function loadRealms(region, locale) {
  if (realmsByRegion[region]) return realmsByRegion[region];

  try {
    const raw = localStorage.getItem(REALM_CACHE_PREFIX + region);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached.locale === locale && cached.fetched_at > Date.now() - REALM_CACHE_TTL) {
        realmsByRegion[region] = cached.realms;
        return cached.realms;
      }
    }
  } catch {}

  try {
    const params = new URLSearchParams({ action: 'realms', region, locale });
    const res = await fetch(`${API_URL}?${params}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const realms = Array.isArray(data.realms) ? data.realms : [];
    realmsByRegion[region] = realms;
    try {
      localStorage.setItem(REALM_CACHE_PREFIX + region, JSON.stringify({
        locale, fetched_at: Date.now(), realms,
      }));
    } catch {}
    return realms;
  } catch {
    return [];
  }
}

// Full category tree — large payload, cached 7 days. Populates state.categoryData.
const CATEGORY_CACHE_KEY = 'wow_category_map_v4';

export async function ensureCategoryMap() {
  const region = $('region').value;
  const locale = $('locale').value;
  if (state.categoryData &&
      state.categoryData.region === region &&
      state.categoryData.locale === locale) return state.categoryData;
  if (state.categoryMapPromise) return state.categoryMapPromise;

  try {
    const raw = localStorage.getItem(CATEGORY_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached.region === region && cached.locale === locale &&
          cached.fetched_at > Date.now() - 7 * 86400 * 1000) {
        state.categoryData = cached;
        return state.categoryData;
      }
    }
  } catch {}

  state.categoryMapPromise = (async () => {
    const params = new URLSearchParams({ action: 'category-map', region, locale });
    const res = await fetch(`${API_URL}?${params}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    state.categoryData = {
      region, locale, fetched_at: Date.now(),
      root_ids: data.root_ids || [],
      categories: data.categories || {},
    };
    try {
      localStorage.setItem(CATEGORY_CACHE_KEY, JSON.stringify(state.categoryData));
    } catch {}
    return state.categoryData;
  })();
  try { return await state.categoryMapPromise; }
  finally { state.categoryMapPromise = null; }
}

// Per-achievement detail (criterion descriptions, points) — in-memory cache,
// re-fetched if a hover repeats. Backend caches the upstream call 7d.
const achDetailCache    = new Map();
const achDetailResolved = new Map();

// Sync read of the resolved detail; returns undefined if not yet fetched.
// Used by the summary view to render points eagerly when available.
export const getCachedAchievementDetail = id => achDetailResolved.get(id);

export async function getAchievementDetail(id) {
  if (achDetailCache.has(id)) return achDetailCache.get(id);
  const region = $('region').value;
  const locale = $('locale').value;
  const p = (async () => {
    try {
      const params = new URLSearchParams({ action: 'achievement-detail', id, region, locale });
      const res = await fetch(`${API_URL}?${params}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (data) achDetailResolved.set(id, data);
      return data;
    } catch { return null; }
  })();
  achDetailCache.set(id, p);
  return p;
}
