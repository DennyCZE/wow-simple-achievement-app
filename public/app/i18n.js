import { $ } from './dom.js';

export const i18n = {
  cs: {
    labelCharacter: 'Jméno postavy',
    labelRealm: 'Realm / Server',
    labelRegion: 'Region',
    labelLocale: 'Jazyk',
    regionEU: 'Evropa (EU)', regionUS: 'Amerika (US)', regionKR: 'Korea (KR)', regionTW: 'Taiwan (TW)',
    placeholderCharacter: 'např. Thrall',
    placeholderRealm: 'např. Argent Dawn',
    submit: 'Načíst achievementy',
    submitLoading: 'Načítám...',
    favAdd: '☆ Přidat do oblíbených',
    favRemove: '★ Odebrat z oblíbených',
    favRemoveAria: 'Odebrat',
    favRemoveConfirm: f => `Odebrat "${f.character} – ${f.realm} (${f.region.toUpperCase()})" z oblíbených?`,
    formExpand: 'Změnit postavu',
    cacheHit: 'cache: hit',
    cacheLive: 'cache: live',
    statusFillFields: 'Vyplň prosím jméno postavy i realm.',
    statusLoading: 'Načítám data z Battle.net API...',
    statusError: 'Chyba',
    statusConn: 'Chyba spojení: ',
    statusNotFound: (c, r) => `Postava "${c}" na realmu "${r}" nebyla nalezena. Zkontroluj jméno a server.`,
    pointsTitle: 'Achievement Points',
    summaryView: 'Souhrn',
    recentTitle: 'Nedávné achievementy',
    progressTitle: 'Přehled postupu',
    totalEarned: 'Achievementů získáno',
    searchResults: 'Hledání',
    categoryLoading: 'Načítám mapu kategorií (první načtení může trvat až minutu)...',
    categoryFail: 'Nepodařilo se načíst kategorie: ',
    searchPlaceholder: 'Hledat achievement...',
    filterAll: 'Vše',
    filterCompleted: '✓ Splněno',
    filterIncomplete: 'Rozpracováno',
    empty: 'Žádné výsledky odpovídající filtru.',
    tipLoading: 'Načítám kritéria...',
    tipNoCriteria: 'Bez dílčích kritérií.',
    tipError: 'Detail se nepodařilo načíst.',
    dateLocale: 'cs-CZ',
    sortLocale: 'cs',
  },
  en: {
    labelCharacter: 'Character name',
    labelRealm: 'Realm / Server',
    labelRegion: 'Region',
    labelLocale: 'Language',
    regionEU: 'Europe (EU)', regionUS: 'Americas (US)', regionKR: 'Korea (KR)', regionTW: 'Taiwan (TW)',
    placeholderCharacter: 'e.g. Thrall',
    placeholderRealm: 'e.g. Argent Dawn',
    submit: 'Load achievements',
    submitLoading: 'Loading...',
    favAdd: '☆ Add to favorites',
    favRemove: '★ Remove from favorites',
    favRemoveAria: 'Remove',
    favRemoveConfirm: f => `Remove "${f.character} – ${f.realm} (${f.region.toUpperCase()})" from favorites?`,
    formExpand: 'Change character',
    cacheHit: 'cache: hit',
    cacheLive: 'cache: live',
    statusFillFields: 'Please enter both character name and realm.',
    statusLoading: 'Loading data from Battle.net API...',
    statusError: 'Error',
    statusConn: 'Connection error: ',
    statusNotFound: (c, r) => `Character "${c}" on realm "${r}" not found. Check the spelling.`,
    pointsTitle: 'Achievement Points',
    summaryView: 'Summary',
    recentTitle: 'Recent Achievements',
    progressTitle: 'Progress Overview',
    totalEarned: 'Achievements Earned',
    searchResults: 'Search',
    categoryLoading: 'Loading category map (first load may take up to a minute)...',
    categoryFail: 'Failed to load categories: ',
    searchPlaceholder: 'Search achievement...',
    filterAll: 'All',
    filterCompleted: '✓ Completed',
    filterIncomplete: 'In progress',
    empty: 'No results match this filter.',
    tipLoading: 'Loading criteria...',
    tipNoCriteria: 'No child criteria.',
    tipError: 'Failed to load detail.',
    dateLocale: 'en-US',
    sortLocale: 'en',
  },
};

export const uiLang = () => $('locale').value === 'cs_CZ' ? 'cs' : 'en';
export const t = () => i18n[uiLang()];

// Update labels / placeholders that aren't part of any view template.
// Called on init and after the locale dropdown changes.
export function refreshStaticLabels() {
  const _ = t();
  document.querySelector('label[for="character"]').textContent = _.labelCharacter;
  document.querySelector('label[for="realm"]').textContent = _.labelRealm;
  document.querySelector('label[for="region"]').textContent = _.labelRegion;
  document.querySelector('label[for="locale"]').textContent = _.labelLocale;
  document.querySelector('#region option[value="eu"]').textContent = _.regionEU;
  document.querySelector('#region option[value="us"]').textContent = _.regionUS;
  document.querySelector('#region option[value="kr"]').textContent = _.regionKR;
  document.querySelector('#region option[value="tw"]').textContent = _.regionTW;
  const sb = $('searchBtn');
  if (!sb.disabled) sb.textContent = _.submit;
  $('character').placeholder = _.placeholderCharacter;
  $('realm').placeholder = _.placeholderRealm;
  $('pointsLabel').textContent = _.pointsTitle;
  $('searchInput').placeholder = _.searchPlaceholder;
  $('formExpandAction').textContent = _.formExpand;
  document.documentElement.lang = uiLang();
}
