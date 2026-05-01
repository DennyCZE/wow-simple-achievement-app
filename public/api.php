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
// Input validation
// ============================================================
$realm     = strtolower(trim((string)($_GET['realm']     ?? '')));
$character = strtolower(trim((string)($_GET['character'] ?? '')));
$region    = strtolower(trim((string)($_GET['region']    ?? 'eu')));
$locale    = (string)($_GET['locale'] ?? 'cs_CZ');

$realm = preg_replace('/[^a-z0-9-]/', '-', $realm) ?? '';
$realm = trim(preg_replace('/-+/', '-', $realm) ?? '', '-');

$character = preg_replace('/[^a-zàáâäçčďéèêëěíìîïľĺňñóòôöŕřšťúùûüůýÿžź0-9-]/u', '', $character) ?? '';

if ($realm === '' || $character === '') {
    json_error(400, 'Missing or invalid realm/character');
}
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
