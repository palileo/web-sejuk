<?php
declare(strict_types=1);

// Sembunyikan error di layar agar cron job tidak terganggu
ini_set('display_errors', '0');

require __DIR__ . '/config.php';

$backupDir = __DIR__ . '/backups';

// Buat folder backups jika belum ada dan lindungi dengan .htaccess
// agar file SQL tidak bisa didownload secara publik dari browser
if (!is_dir($backupDir)) {
    mkdir($backupDir, 0755, true);
    file_put_contents($backupDir . '/.htaccess', "Require all denied\nDeny from all");
}

$date = date('Y-m-d_H-i-s');
$filename = $backupDir . '/backup_' . $date . '.sql';

try {
    $pdo = db();
    $tables = [];
    $stmt = $pdo->query("SHOW TABLES");
    while ($row = $stmt->fetch(PDO::FETCH_NUM)) {
        $tables[] = $row[0];
    }

    $sql = "-- Database Backup Aplikasi SHU\n";
    $sql .= "-- Waktu: " . date('Y-m-d H:i:s') . "\n\n";

    foreach ($tables as $table) {
        $sql .= "DROP TABLE IF EXISTS `$table`;\n";
        $createStmt = $pdo->query("SHOW CREATE TABLE `$table`");
        $createRow = $createStmt->fetch(PDO::FETCH_NUM);
        $sql .= $createRow[1] . ";\n\n";

        $rows = $pdo->query("SELECT * FROM `$table`");
        while ($row = $rows->fetch(PDO::FETCH_ASSOC)) {
            $keys = array_keys($row);
            $keysString = '`' . implode('`, `', $keys) . '`';
            $values = array_map(function($val) use ($pdo) {
                return $val === null ? 'NULL' : $pdo->quote((string)$val);
            }, array_values($row));
            $valuesString = implode(', ', $values);
            $sql .= "INSERT INTO `$table` ($keysString) VALUES ($valuesString);\n";
        }
        $sql .= "\n\n";
    }

    file_put_contents($filename, $sql);

    // Hapus backup lama (lebih dari 7 hari) untuk menghemat penyimpanan hosting
    $files = glob($backupDir . '/backup_*.sql');
    foreach ($files as $file) {
        if (is_file($file) && time() - filemtime($file) > 7 * 24 * 60 * 60) {
            unlink($file);
        }
    }

    echo "Backup sukses: " . basename($filename) . "\n";
} catch (Throwable $e) {
    error_log('Backup Error: ' . $e->getMessage());
    echo "Backup gagal.\n";
}