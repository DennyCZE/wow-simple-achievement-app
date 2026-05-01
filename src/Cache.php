<?php
declare(strict_types=1);

/**
 * SQLite-backed cache for OAuth tokens and Blizzard API responses.
 */
final class Cache
{
    private PDO $db;

    public function __construct(string $dbPath)
    {
        $dir = dirname($dbPath);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $this->db = new PDO('sqlite:' . $dbPath);
        $this->db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->db->exec('PRAGMA journal_mode = WAL');
        $this->db->exec('PRAGMA synchronous = NORMAL');

        $this->db->exec('
            CREATE TABLE IF NOT EXISTS cache (
                key        TEXT PRIMARY KEY,
                value      TEXT NOT NULL,
                expires_at INTEGER NOT NULL
            )
        ');
        $this->db->exec('CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache(expires_at)');
    }

    public function get(string $key): ?string
    {
        $stmt = $this->db->prepare('SELECT value, expires_at FROM cache WHERE key = :k');
        $stmt->execute([':k' => $key]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            return null;
        }
        if ((int)$row['expires_at'] < time()) {
            $this->delete($key);
            return null;
        }
        return $row['value'];
    }

    public function set(string $key, string $value, int $ttlSeconds): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO cache(key, value, expires_at)
             VALUES(:k, :v, :e)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at'
        );
        $stmt->execute([
            ':k' => $key,
            ':v' => $value,
            ':e' => time() + $ttlSeconds,
        ]);
    }

    public function delete(string $key): void
    {
        $stmt = $this->db->prepare('DELETE FROM cache WHERE key = :k');
        $stmt->execute([':k' => $key]);
    }

    /** Remove all expired entries. Called occasionally. */
    public function gc(): int
    {
        $stmt = $this->db->prepare('DELETE FROM cache WHERE expires_at < :t');
        $stmt->execute([':t' => time()]);
        return $stmt->rowCount();
    }
}
