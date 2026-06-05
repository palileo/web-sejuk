<?php
declare(strict_types=1);

require __DIR__ . '/config.php';

header('Content-Type: text/plain; charset=utf-8');

try {
    db()->exec("
        CREATE TABLE IF NOT EXISTS app_state (
            state_key VARCHAR(80) NOT NULL PRIMARY KEY,
            state_json LONGTEXT NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    echo "Install selesai. Tabel app_state siap dipakai.\n";
    echo "Hapus install.php setelah berhasil dijalankan di hosting.\n";
} catch (Throwable $e) {
    http_response_code(500);
    echo "Install gagal: " . $e->getMessage() . "\n";
}
