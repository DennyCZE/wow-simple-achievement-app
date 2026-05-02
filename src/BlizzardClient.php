<?php
declare(strict_types=1);

/**
 * Battle.net API client. Handles OAuth (cached) and authenticated requests.
 */
final class BlizzardClient
{
    private const TOKEN_CACHE_KEY = 'oauth_token';

    public function __construct(
        private readonly string $clientId,
        private readonly string $clientSecret,
        private readonly Cache $cache,
    ) {}

    public function getAccessToken(): string
    {
        $cached = $this->cache->get(self::TOKEN_CACHE_KEY);
        if ($cached !== null) {
            return $cached;
        }

        $ch = curl_init('https://oauth.battle.net/token');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => 'grant_type=client_credentials',
            CURLOPT_USERPWD        => $this->clientId . ':' . $this->clientSecret,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err      = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            throw new RuntimeException('OAuth request failed: ' . $err);
        }
        if ($httpCode !== 200) {
            throw new RuntimeException('OAuth returned HTTP ' . $httpCode);
        }

        $data = json_decode((string)$response, true);
        if (!isset($data['access_token'])) {
            throw new RuntimeException('OAuth response missing access_token');
        }

        // Cache for 23 hours (tokens last 24h)
        $this->cache->set(self::TOKEN_CACHE_KEY, $data['access_token'], 23 * 3600);

        return $data['access_token'];
    }

    /**
     * Fetch character achievements from the Profile API.
     *
     * @return array{status:int, body:string}
     */
    public function getCharacterAchievements(
        string $region,
        string $realm,
        string $character,
        string $locale,
    ): array {
        $token = $this->getAccessToken();

        $url = sprintf(
            'https://%s.api.blizzard.com/profile/wow/character/%s/%s/achievements?namespace=profile-%s&locale=%s',
            $region,
            rawurlencode($realm),
            rawurlencode($character),
            $region,
            $locale
        );

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $token],
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);

        $body     = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err      = curl_error($ch);
        curl_close($ch);

        if ($body === false) {
            throw new RuntimeException('Blizzard API request failed: ' . $err);
        }

        return ['status' => (int)$httpCode, 'body' => (string)$body];
    }

    /** @return array<string,mixed> */
    public function getRealmIndex(string $region, string $locale): array
    {
        return $this->getJson(sprintf(
            'https://%s.api.blizzard.com/data/wow/realm/index?namespace=dynamic-%s&locale=%s',
            $region, $region, rawurlencode($locale)
        ));
    }

    /** @return array<string,mixed> */
    public function getAchievementCategoryIndex(string $region, string $locale): array
    {
        return $this->getJson(sprintf(
            'https://%s.api.blizzard.com/data/wow/achievement-category/index?namespace=static-%s&locale=%s',
            $region, $region, rawurlencode($locale)
        ));
    }

    /** @return array<string,mixed> */
    public function getAchievementCategory(string $region, string $locale, int $categoryId): array
    {
        return $this->getJson(sprintf(
            'https://%s.api.blizzard.com/data/wow/achievement-category/%d?namespace=static-%s&locale=%s',
            $region, $categoryId, $region, rawurlencode($locale)
        ));
    }

    /** @return array<string,mixed> */
    public function getAchievement(string $region, string $locale, int $achievementId): array
    {
        return $this->getJson(sprintf(
            'https://%s.api.blizzard.com/data/wow/achievement/%d?namespace=static-%s&locale=%s',
            $region, $achievementId, $region, rawurlencode($locale)
        ));
    }

    /** @return array<string,mixed> */
    private function getJson(string $url): array
    {
        $token = $this->getAccessToken();

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $token],
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);

        $body     = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err      = curl_error($ch);
        curl_close($ch);

        if ($body === false) {
            throw new RuntimeException('Blizzard API request failed: ' . $err);
        }
        if ($httpCode !== 200) {
            throw new RuntimeException(sprintf('Blizzard API HTTP %d for %s', $httpCode, $url));
        }

        $data = json_decode((string)$body, true);
        if (!is_array($data)) {
            throw new RuntimeException('Invalid JSON from Blizzard');
        }
        return $data;
    }
}
