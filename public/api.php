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
    // action=category-map: build {categoryId: {name, achievement_ids:[...]}}
    // covering descendants. Heavy first call (~150 Blizzard calls,
    // 30-60s); cached 7 days.
    // --------------------------------------------------------
    if ($action === 'category-map') {
        set_time_limit(120);

        $cacheKey = sprintf('catmap:%s:%s', $region, $locale);
        $cached = $cache->get($cacheKey);
        if ($cached !== null) {
            header('X-Cache: HIT');
            echo $cached;
            exit;
        }
        header('X-Cache: MISS');

        $index   = $client->getAchievementCategoryIndex($region, $locale);
        $allCats = $index['categories'] ?? [];

        $names              = [];
        $directAchievements = [];
        $subcategoryIds     = [];

        foreach ($allCats as $cat) {
            $catId = (int)($cat['id'] ?? 0);
            if ($catId === 0) continue;
            $names[$catId] = (string)($cat['name'] ?? '');
            try {
                $detail = $client->getAchievementCategory($region, $locale, $catId);
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

        $output = ['categories' => []];
        foreach (array_keys($names) as $catId) {
            $output['categories'][(string)$catId] = [
                'name'            => $names[$catId],
                'achievement_ids' => $rollup($catId),
            ];
        }

        $body = json_encode($output, JSON_UNESCAPED_UNICODE);
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
