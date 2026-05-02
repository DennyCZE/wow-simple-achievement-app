<?php
declare(strict_types=1);

require __DIR__ . '/../src/Cache.php';
require __DIR__ . '/../src/BlizzardClient.php';

// ============================================================
// Headers
// ============================================================
$allowedOrigin = getenv('ALLOWED_ORIGIN') ?: '';
if ($allowedOrigin !== '') {
    header('Access-Control-Allow-Origin: ' . $allowedOrigin);
}
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Methods: GET');
    http_response_code(204);
    exit;
}

// ============================================================
// Helpers
// ============================================================
function json_error(int $code, string $msg): never {
    http_response_code($code);
    echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

// ============================================================
// Config from env
// ============================================================
$clientId     = getenv('BNET_CLIENT_ID') ?: '';
$clientSecret = getenv('BNET_CLIENT_SECRET') ?: '';
$cacheTtl     = (int)(getenv('CACHE_TTL') ?: 3600);

if ($clientId === '' || $clientSecret === '') {
    json_error(500, 'Server not configured: missing BNET_CLIENT_ID or BNET_CLIENT_SECRET');
}

// ============================================================
// Common input: region + locale (always required)
// ============================================================
$action = (string)($_GET['action'] ?? 'achievements');
$region = strtolower(trim((string)($_GET['region'] ?? 'eu')));
$locale = (string)($_GET['locale'] ?? 'cs_CZ');

if (!in_array($region, ['us', 'eu', 'kr', 'tw'], true)) {
    json_error(400, 'Invalid region (use us, eu, kr, or tw)');
}

$allowedLocales = [
    'en_US', 'en_GB', 'cs_CZ', 'de_DE', 'es_ES', 'es_MX',
    'fr_FR', 'it_IT', 'pl_PL', 'pt_BR', 'ru_RU', 'ko_KR', 'zh_TW',
];
if (!in_array($locale, $allowedLocales, true)) {
    $locale = 'cs_CZ';
}

// ============================================================
// Run
// ============================================================
try {
    $cache  = new Cache('/var/www/data/cache.sqlite');
    $client = new BlizzardClient($clientId, $clientSecret, $cache);

    // --------------------------------------------------------
    // action=realms: list of realms for a region (name + slug),
    // alphabetical, cached 7 days.
    // --------------------------------------------------------
    if ($action === 'realms') {
        $cacheKey = sprintf('realms:%s:%s', $region, $locale);
        $cached = $cache->get($cacheKey);
        if ($cached !== null) {
            header('X-Cache: HIT');
            echo $cached;
            exit;
        }
        header('X-Cache: MISS');

        $data   = $client->getRealmIndex($region, $locale);
        $realms = array_map(
            fn($r) => [
                'name' => (string)($r['name'] ?? ''),
                'slug' => (string)($r['slug'] ?? ''),
            ],
            $data['realms'] ?? []
        );
        $realms = array_values(array_filter($realms, fn($r) => $r['name'] !== ''));
        usort($realms, fn($a, $b) => strcmp($a['name'], $b['name']));

        $body = json_encode(['realms' => $realms], JSON_UNESCAPED_UNICODE);
        $cache->set($cacheKey, $body, 7 * 86400);
        echo $body;
        exit;
    }

    // --------------------------------------------------------
    // action=category-map: build {categoryId: {name, achievement_ids:[...]}}
    // covering descendants. Heavy first call (~150 Blizzard calls,
    // 30-60s); cached 7 days.
    // --------------------------------------------------------
    if ($action === 'category-map') {
        set_time_limit(120);

        // catmap4 — adds English-locale fallback for untranslated category names
        $cacheKey = sprintf('catmap4:%s:%s', $region, $locale);
        $cached = $cache->get($cacheKey);
        if ($cached !== null) {
            header('X-Cache: HIT');
            echo $cached;
            exit;
        }
        header('X-Cache: MISS');

        $index   = $client->getAchievementCategoryIndex($region, $locale);
        $allCats = $index['categories'] ?? [];
        $rootIds = array_values(array_filter(array_map(
            fn($r) => (int)($r['id'] ?? 0),
            $index['root_categories'] ?? []
        ), fn($id) => $id > 0));

        $names              = [];
        $directAchievements = [];
        $subcategoryIds     = [];

        $resolveName = static function ($val, string $locale): string {
            if (is_string($val)) return $val;
            if (is_array($val)) {
                foreach ([$locale, 'en_US', 'en_GB'] as $key) {
                    if (isset($val[$key]) && is_string($val[$key])) return $val[$key];
                }
                foreach ($val as $v) {
                    if (is_string($v) && $v !== '') return $v;
                }
            }
            return '';
        };

        foreach ($allCats as $cat) {
            $catId = (int)($cat['id'] ?? 0);
            if ($catId === 0) continue;
            $name = '';
            try {
                $detail = $client->getAchievementCategory($region, $locale, $catId);
                $name   = $resolveName($detail['name'] ?? null, $locale);
                $directAchievements[$catId] = array_map(
                    fn($a) => (int)($a['id'] ?? 0),
                    $detail['achievements'] ?? []
                );
                $subcategoryIds[$catId] = array_map(
                    fn($s) => (int)($s['id'] ?? 0),
                    $detail['subcategories'] ?? []
                );
            } catch (Throwable $e) {
                $directAchievements[$catId] = [];
                $subcategoryIds[$catId]     = [];
            }
            // Fall back to English when the requested locale has no translation
            if ($name === '' && $locale !== 'en_US') {
                try {
                    $detailEn = $client->getAchievementCategory($region, 'en_US', $catId);
                    $name     = $resolveName($detailEn['name'] ?? null, 'en_US');
                } catch (Throwable $e) {}
            }
            // Index name as another fallback (in case detail fetches failed)
            if ($name === '') $name = $resolveName($cat['name'] ?? null, $locale);
            if ($name === '') $name = 'Category #' . $catId;
            $names[$catId] = $name;
        }

        $rolled = [];
        $rollup = function (int $id) use (&$rollup, &$rolled, $directAchievements, $subcategoryIds): array {
            if (isset($rolled[$id])) return $rolled[$id];
            $rolled[$id] = []; // mark visited (cycle guard)
            $ids = $directAchievements[$id] ?? [];
            foreach ($subcategoryIds[$id] ?? [] as $subId) {
                $ids = array_merge($ids, $rollup($subId));
            }
            $rolled[$id] = array_values(array_unique($ids));
            return $rolled[$id];
        };

        $output = ['root_ids' => $rootIds, 'categories' => []];
        foreach (array_keys($names) as $catId) {
            $output['categories'][(string)$catId] = [
                'name'            => $names[$catId],
                'subcategory_ids' => $subcategoryIds[$catId] ?? [],
                'achievement_ids' => $rollup($catId),
            ];
        }

        $body = json_encode($output, JSON_UNESCAPED_UNICODE);
        $cache->set($cacheKey, $body, 7 * 86400);
        echo $body;
        exit;
    }

    // --------------------------------------------------------
    // action=achievement-detail: localized name + per-criterion
    // descriptions for one achievement, cached 7 days. Used by the
    // hover tooltip on in-progress rows.
    // --------------------------------------------------------
    if ($action === 'achievement-detail') {
        $id = (int)($_GET['id'] ?? 0);
        if ($id <= 0) {
            json_error(400, 'Missing or invalid id');
        }

        $cacheKey = sprintf('ach-detail-v2:%s:%d:%s', $region, $id, $locale);
        $cached = $cache->get($cacheKey);
        if ($cached !== null) {
            header('X-Cache: HIT');
            echo $cached;
            exit;
        }
        header('X-Cache: MISS');

        try {
            $detail = $client->getAchievement($region, $locale, $id);
        } catch (Throwable $e) {
            json_error(404, 'Achievement not found');
        }

        // Blizzard returns empty strings (not a per-locale dict) when the
        // requested locale lacks a translation. Re-fetch in en_US and merge
        // so name/description/criteria text always render something.
        $detailEn = null;
        $needsFallback = $locale !== 'en_US' && (
            ($detail['name'] ?? '') === '' ||
            ($detail['description'] ?? '') === '' ||
            (($detail['criteria']['description'] ?? '') === '' && empty($detail['criteria']['child_criteria']))
        );
        if (!$needsFallback && $locale !== 'en_US') {
            foreach ($detail['criteria']['child_criteria'] ?? [] as $kid) {
                if (($kid['description'] ?? '') === '') { $needsFallback = true; break; }
            }
        }
        if ($needsFallback) {
            try { $detailEn = $client->getAchievement($region, 'en_US', $id); }
            catch (Throwable $e) { $detailEn = null; }
        }

        $pick = static function (?string $primary, ?string $fallback): string {
            if ($primary !== null && $primary !== '') return $primary;
            return $fallback ?? '';
        };

        $simplified = [
            'id'          => (int)($detail['id'] ?? $id),
            'name'        => $pick($detail['name'] ?? '', $detailEn['name'] ?? ''),
            'description' => $pick($detail['description'] ?? '', $detailEn['description'] ?? ''),
            'criteria'    => null,
        ];

        if (isset($detail['criteria']) && is_array($detail['criteria'])) {
            $c   = $detail['criteria'];
            $cEn = $detailEn['criteria'] ?? [];
            $kidsEnById = [];
            foreach ($cEn['child_criteria'] ?? [] as $k) {
                if (isset($k['id'])) $kidsEnById[(int)$k['id']] = $k;
            }
            $children = [];
            foreach ($c['child_criteria'] ?? [] as $kid) {
                $kid_id = (int)($kid['id'] ?? 0);
                $en = $kidsEnById[$kid_id] ?? [];
                $children[] = [
                    'id'          => $kid_id,
                    'description' => $pick($kid['description'] ?? '', $en['description'] ?? ''),
                    'amount'      => isset($kid['amount']) ? (int)$kid['amount'] : null,
                ];
            }
            $simplified['criteria'] = [
                'description'    => $pick($c['description'] ?? '', $cEn['description'] ?? ''),
                'amount'         => isset($c['amount']) ? (int)$c['amount'] : null,
                'child_criteria' => $children,
            ];
        }

        $body = json_encode($simplified, JSON_UNESCAPED_UNICODE);
        $cache->set($cacheKey, $body, 7 * 86400);
        echo $body;
        exit;
    }

    // --------------------------------------------------------
    // action=achievements (default): character achievement summary
    // --------------------------------------------------------
    $realm     = strtolower(trim((string)($_GET['realm']     ?? '')));
    $character = strtolower(trim((string)($_GET['character'] ?? '')));

    $realm = preg_replace('/[^a-z0-9-]/', '-', $realm) ?? '';
    $realm = trim(preg_replace('/-+/', '-', $realm) ?? '', '-');

    $character = preg_replace('/[^a-zàáâäçčďéèêëěíìîïľĺňñóòôöŕřšťúùûüůýÿžź0-9-]/u', '', $character) ?? '';

    if ($realm === '' || $character === '') {
        json_error(400, 'Missing or invalid realm/character');
    }

    $cacheKey = sprintf('ach:%s:%s:%s:%s', $region, $realm, $character, $locale);

    $cached = $cache->get($cacheKey);
    if ($cached !== null) {
        header('X-Cache: HIT');
        echo $cached;
        exit;
    }

    header('X-Cache: MISS');
    $result = $client->getCharacterAchievements($region, $realm, $character, $locale);

    if ($result['status'] === 404) {
        json_error(404, 'Character not found. Check realm and character spelling.');
    }
    if ($result['status'] !== 200) {
        json_error(502, 'Blizzard API returned HTTP ' . $result['status']);
    }

    $cache->set($cacheKey, $result['body'], $cacheTtl);

    if (random_int(1, 100) === 1) {
        $cache->gc();
    }

    echo $result['body'];

} catch (Throwable $e) {
    json_error(500, $e->getMessage());
}
