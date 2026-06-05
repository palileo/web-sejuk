<?php
declare(strict_types=1);

require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function json_response(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function ensure_state_table(): void
{
    db()->exec("
        CREATE TABLE IF NOT EXISTS app_state (
            state_key VARCHAR(80) NOT NULL PRIMARY KEY,
            state_json LONGTEXT NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
}

try {
    ensure_state_table();

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $stmt = db()->prepare('SELECT state_json, updated_at FROM app_state WHERE state_key = ? LIMIT 1');
        $stmt->execute([APP_STATE_KEY]);
        $row = $stmt->fetch();
        json_response([
            'ok' => true,
            'state' => $row ? json_decode((string) $row['state_json'], true) : null,
            'updatedAt' => $row['updated_at'] ?? null,
        ]);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $raw = file_get_contents('php://input') ?: '';
        if (strlen($raw) > 12 * 1024 * 1024) {
            json_response(['ok' => false, 'error' => 'Payload terlalu besar.'], 413);
        }

        $payload = json_decode($raw, true);
        if (!is_array($payload) || !isset($payload['state']) || !is_array($payload['state'])) {
            json_response(['ok' => false, 'error' => 'Payload tidak valid.'], 422);
        }

        $stateJson = json_encode($payload['state'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($stateJson === false) {
            json_response(['ok' => false, 'error' => 'State tidak bisa diproses.'], 422);
        }

        $stmt = db()->prepare('
            INSERT INTO app_state (state_key, state_json)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE state_json = VALUES(state_json), updated_at = CURRENT_TIMESTAMP
        ');
        $stmt->execute([APP_STATE_KEY, $stateJson]);

        json_response(['ok' => true]);
    }

    json_response(['ok' => false, 'error' => 'Metode tidak didukung.'], 405);
} catch (Throwable $e) {
    json_response(['ok' => false, 'error' => 'Database error. Periksa config.php dan user database.'], 500);
}
