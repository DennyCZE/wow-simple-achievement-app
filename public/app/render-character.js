import { $, escapeHtml, formatDate } from './dom.js';
import { state } from './state.js';
import { t } from './i18n.js';
import { fetchCharacterSummary } from './api.js';

export function renderCharacterView() {
  if (state.characterStatus === 'loading') {
    return `<div class="char-status">${escapeHtml(t().charLoading)}</div>`;
  }
  if (state.characterStatus === 'error') {
    const detail = state.characterError ? ` (${escapeHtml(state.characterError)})` : '';
    return `<div class="char-status char-status-error">${escapeHtml(t().charLoadError)}${detail}</div>`;
  }
  const c = state.characterData;
  if (!c) return '';

  const _ = t();
  const heroSrc = c.main_url || c.inset_url || c.avatar_url || '';
  const factionClass = (c.faction || '').toLowerCase().includes('alliance') ? 'alliance'
                    : (c.faction || '').toLowerCase().includes('horde')   ? 'horde'
                    : '';
  const lastLogin = c.last_login_timestamp
    ? formatDate(c.last_login_timestamp, _.dateLocale)
    : '—';
  const fmtNum = n => (n || 0).toLocaleString(_.dateLocale);

  const stats = [
    [_.charLevel,         c.level ? String(c.level) : '—'],
    [_.charRace,          c.race  || '—'],
    [_.charClass,         c.class || '—'],
    [_.charSpec,          c.spec  || '—'],
    [_.charFaction,       c.faction || '—'],
    [_.charGender,        c.gender  || '—'],
    [_.charRealm,         c.realm   || '—'],
    [_.charGuild,         c.guild   || _.charNoGuild],
    [_.charItemLevel,     c.equipped_item_level ? String(c.equipped_item_level) : '—'],
    [_.charAvgItemLevel,  c.average_item_level  ? String(c.average_item_level)  : '—'],
    [_.pointsTitle,       fmtNum(c.achievement_points)],
    [_.charLastLogin,     lastLogin],
  ];

  return `
    <section class="char-card${factionClass ? ' ' + factionClass : ''}">
      ${heroSrc ? `<div class="char-hero"><img src="${escapeHtml(heroSrc)}" alt=""></div>` : ''}
      <div class="char-info">
        <h2 class="char-name">${escapeHtml(c.name || '')}</h2>
        <div class="char-tagline">${escapeHtml([
          c.level ? `${_.charLevel} ${c.level}` : '',
          c.race, c.spec, c.class,
        ].filter(Boolean).join(' · '))}</div>
        <dl class="char-stats">
          ${stats.map(([k, v]) => `
            <div class="char-stat">
              <dt>${escapeHtml(k)}</dt>
              <dd>${escapeHtml(v)}</dd>
            </div>
          `).join('')}
        </dl>
      </div>
    </section>
  `;
}

// Lazy fetch driver. Re-renders content when state transitions.
export async function ensureCharacterData(rerender) {
  if (state.characterStatus === 'loading' || state.characterStatus === 'loaded') return;

  const character = $('character').value.trim();
  const realm     = $('realm').value.trim();
  const region    = $('region').value;
  const locale    = $('locale').value;
  if (!character || !realm) return;

  state.characterStatus = 'loading';
  state.characterError  = '';
  rerender();

  try {
    const { ok, status, data } = await fetchCharacterSummary({ character, realm, region, locale });
    if (!ok) {
      state.characterStatus = 'error';
      state.characterError  = data?.error || `HTTP ${status}`;
    } else {
      state.characterData   = data;
      state.characterStatus = 'loaded';
    }
  } catch (err) {
    state.characterStatus = 'error';
    state.characterError  = err.message || '';
  }
  rerender();
}

export function resetCharacterState() {
  state.characterData   = null;
  state.characterStatus = 'idle';
  state.characterError  = '';
}
