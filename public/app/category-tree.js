import { state } from './state.js';

// Walk root + recursive subcategories and union all achievement IDs into a Set.
// Used both for summary rollups and the per-category tooltip.
export function collectAchievementIds(rootId) {
  const ids = new Set();
  const cd = state.categoryData;
  if (!cd) return ids;
  const visit = id => {
    const cat = cd.categories[String(id)];
    if (!cat) return;
    (cat.achievement_ids || []).forEach(x => ids.add(x));
    (cat.subcategory_ids || []).forEach(visit);
  };
  visit(rootId);
  return ids;
}
