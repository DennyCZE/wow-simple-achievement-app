// Single shared state object — modules read and mutate properties on this
// object (live binding), avoiding the need to reassign top-level imports.
export const state = {
  currentFilter: 'all',
  searchTerm: '',
  currentView: 'summary',         // 'summary', 'character', or a category id (number)
  categoryData: null,              // { region, locale, fetched_at, root_ids, categories }
  categoryMapPromise: null,
  lastResultsData: null,
  childStateById: {},              // ach.id → Map<criterionId, isCompleted>
  characterData: null,             // simplified profile summary, lazily loaded
  characterStatus: 'idle',         // 'idle' | 'loading' | 'loaded' | 'error'
  characterError: '',
};
