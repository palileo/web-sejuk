<?php
declare(strict_types=1);

ini_set('display_errors', '0');
ob_start();

require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function json_response(array $payload, int $status = 200): void
{
    http_response_code($status);
    while (ob_get_level()) {
        ob_end_clean();
    }
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

function load_state_row(): ?array
{
    $stmt = db()->prepare('SELECT state_json, updated_at FROM app_state WHERE state_key = ? LIMIT 1');
    $stmt->execute([APP_STATE_KEY]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function safe_download_name(string $name): string
{
    $name = trim(preg_replace('/[^A-Za-z0-9._ -]+/', '_', $name) ?: '');
    if ($name === '' || substr(strtolower($name), -5) !== '.xlsx') {
        return 'arus-kas.xlsx';
    }
    return $name;
}

function cashflow_file_response(): void
{
    $row = load_state_row();
    $state = $row ? json_decode((string) $row['state_json'], true) : null;
    $cashFlow = is_array($state['cashFlow'] ?? null) ? $state['cashFlow'] : null;
    $dataUrl = is_string($cashFlow['fileDataUrl'] ?? null) ? $cashFlow['fileDataUrl'] : '';

    if ($dataUrl === '' || !preg_match('/^data:([^;,]+)?;base64,(.+)$/', $dataUrl, $match)) {
        json_response(['ok' => false, 'error' => 'File arus kas belum tersedia.'], 404);
    }

    $mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    $binary = base64_decode($match[2], true);
    if ($binary === false) {
        json_response(['ok' => false, 'error' => 'File arus kas tidak valid.'], 422);
    }

    $fileName = safe_download_name((string) ($cashFlow['fileName'] ?? 'arus-kas.xlsx'));
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . strlen($binary));
    header('Content-Disposition: inline; filename="' . str_replace('"', '', $fileName) . '"');
    header('Cache-Control: no-store, max-age=0');
    echo $binary;
    exit;
}

function ensure_app_data_tables(): void
{
    $db = db();
    $db->exec("
        CREATE TABLE IF NOT EXISTS app_roles (
            id VARCHAR(50) NOT NULL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            role VARCHAR(255) NOT NULL,
            focus TEXT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");
    $db->exec("
        CREATE TABLE IF NOT EXISTS app_checklist_items (
            role_id VARCHAR(50) NOT NULL,
            no INT NOT NULL,
            area VARCHAR(255) NOT NULL,
            task TEXT NOT NULL,
            frequency VARCHAR(255) NOT NULL,
            weight INT NOT NULL,
            PRIMARY KEY (role_id, no),
            FOREIGN KEY (role_id) REFERENCES app_roles(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");

    $stmt = $db->query('SELECT COUNT(*) FROM app_roles');
    if ($stmt && $stmt->fetchColumn() == 0) {
        $roles = [
            ['ketua', 'Ketua Pengurus', 'Ketua Pengurus', 'Arah organisasi, keputusan, pengawasan'],
            ['marketing', 'Manager Marketing', 'Manager Marketing', 'Pemasaran, penjualan, pasar, harga produk'],
            ['sekretaris', 'Sekretaris Umum', 'Sekretaris Umum', 'Administrasi, notulen, arsip, evaluasi'],
            ['bendahara', 'Bendahara Umum', 'Bendahara Umum', 'Keuangan, kas, laporan, pembagian hasil'],
            ['operasional', 'Manager Operasional', 'Manager Lapangan / Operasional', 'Alur kerja, tugas lapangan, operasional'],
            ['pengawas', 'Pengawas Koperasi', 'Pengawas Koperasi', 'Pengawasan pengurus, evaluasi kerja, transparansi, kontrol organisasi']
        ];
        $role_stmt = $db->prepare('INSERT INTO app_roles (id, name, role, focus) VALUES (?, ?, ?, ?)');
        foreach ($roles as $role) {
            $role_stmt->execute($role);
        }

        $checklists = [
            'ketua' => [ [1, 'Kepemimpinan', 'Aktif memimpin rapat koperasi', 'Mingguan', 10], [2, 'Kepemimpinan', 'Menetapkan arah organisasi secara jelas', 'Mingguan', 10], [3, 'Keputusan', 'Berani mengambil keputusan penting', 'Mingguan', 10], [4, 'Pengawasan', 'Memastikan setiap keputusan rapat dijalankan', 'Mingguan', 10], [5, 'Pengawasan', 'Meminta laporan dari setiap bagian', 'Mingguan', 10], [6, 'Keuangan', 'Mengawasi keuangan bersama bendahara secara rutin', 'Mingguan', 10], [7, 'Koordinasi', 'Menjadi penengah jika terjadi perbedaan pendapat', 'Mingguan', 10], [8, 'Disiplin', 'Tidak membiarkan masalah menggantung', 'Mingguan', 10], [9, 'Disiplin', 'Menegur pengurus yang tidak menjalankan tugas', 'Mingguan', 10], [10, 'Arah Organisasi', 'Menjaga koperasi tetap sesuai prinsip dan tujuan', 'Mingguan', 10] ],
            'marketing' => [ [1, 'Produk/Jasa', 'Membuat daftar produk atau jasa yang akan dipasarkan', 'Mingguan', 10], [2, 'Target', 'Menyusun target penjualan', 'Mingguan', 10], [3, 'Strategi', 'Membuat strategi promosi koperasi', 'Mingguan', 10], [4, 'Pasar', 'Menentukan target pasar', 'Mingguan', 10], [5, 'Mitra', 'Mencari calon pembeli atau mitra', 'Mingguan', 10], [6, 'Harga', 'Membuat aturan harga bersama bendahara dan ketua', 'Mingguan', 10], [7, 'Penjualan', 'Menyusun sistem penjualan yang jelas', 'Mingguan', 10], [8, 'Promosi', 'Membuat agenda promosi rutin', 'Mingguan', 10], [9, 'Laporan', 'Melaporkan perkembangan pasar secara berkala', 'Mingguan', 10], [10, 'Peluang', 'Membawa peluang nyata, bukan hanya ide', 'Mingguan', 10] ],
            'sekretaris' => [ [1, 'Notulen', 'Setiap rapat memiliki notulen tertulis', 'Mingguan', 10], [2, 'Dokumen', 'Menyusun dokumen dasar koperasi', 'Mingguan', 10], [3, 'Keputusan', 'Mencatat keputusan dan pembagian tugas', 'Mingguan', 10], [4, 'Arsip', 'Mengarsipkan data anggota, program, dan kegiatan', 'Mingguan', 10], [5, 'Laporan', 'Membuat format laporan kerja tiap bagian', 'Mingguan', 10], [6, 'Pengingat', 'Mengingatkan pengurus terhadap tugas yang disepakati', 'Mingguan', 10], [7, 'Evaluasi', 'Menyusun indikator evaluasi keseriusan pengurus', 'Mingguan', 10], [8, 'Objektivitas', 'Mencatat perkembangan tiap orang secara objektif', 'Mingguan', 10], [9, 'Sistem', 'Menjaga sistem administrasi tetap rapi', 'Mingguan', 10], [10, 'Akurasi', 'Membedakan janji, rencana, dan tindakan nyata', 'Mingguan', 10] ],
            'bendahara' => [ [1, 'Kas', 'Mencatat seluruh uang masuk dan keluar', 'Mingguan', 10], [2, 'Laporan', 'Membuat laporan kas koperasi', 'Mingguan', 10], [3, 'Bukti', 'Menyimpan bukti transaksi', 'Mingguan', 10], [4, 'Transparansi', 'Laporan keuangan bisa diperiksa', 'Mingguan', 10], [5, 'Pembagian Hasil', 'Menyusun sistem pembagian hasil tertulis', 'Mingguan', 10], [6, 'Anggaran', 'Mengatur pos anggaran kebutuhan mendesak', 'Mingguan', 10], [7, 'Koordinasi', 'Berkoordinasi dengan marketing soal harga dan penjualan', 'Mingguan', 10], [8, 'Koordinasi', 'Berkoordinasi dengan ketua soal pengawasan keuangan', 'Mingguan', 10], [9, 'Disiplin', 'Tidak menunda laporan uang', 'Mingguan', 10], [10, 'Integritas', 'Tidak mencampur uang pribadi dengan uang koperasi', 'Mingguan', 10] ],
            'operasional' => [ [1, 'Tugas Lapangan', 'Membuat daftar tugas lapangan', 'Mingguan', 10], [2, 'Jadwal', 'Menyusun jadwal kerja atau pembagian tugas', 'Mingguan', 10], [3, 'Alur Kerja', 'Menyusun alur kerja dari pesanan sampai penyelesaian', 'Mingguan', 10], [4, 'Pengawasan', 'Mengawasi pelaksanaan tugas di lapangan', 'Mingguan', 10], [5, 'Kendala', 'Melaporkan kendala operasional dengan jelas', 'Mingguan', 10], [6, 'Pemerataan', 'Memastikan pekerjaan tidak dibebankan kepada orang tertentu', 'Mingguan', 10], [7, 'Kerapihan', 'Menjaga kerapihan proses kerja', 'Mingguan', 10], [8, 'Kepatuhan', 'Menjalankan operasional sesuai keputusan rapat', 'Mingguan', 10], [9, 'Kualitas', 'Menghindari kerja asal-asalan', 'Mingguan', 10], [10, 'Laporan', 'Membawa laporan nyata dari lapangan, bukan hanya keluhan', 'Mingguan', 10] ],
            'pengawas' => [ [1, 'Pengawasan', 'Memantau perkembangan kerja setiap pengurus', 'Mingguan', 10], [2, 'Keputusan', 'Memastikan keputusan rapat benar-benar dijalankan', 'Mingguan', 10], [3, 'Pemeriksaan', 'Memeriksa laporan administrasi, keuangan, pemasaran, dan operasional', 'Mingguan', 10], [4, 'Teguran', 'Berani menegur jika ada tugas yang tidak dijalankan', 'Mingguan', 10], [5, 'Transparansi', 'Mengawasi transparansi keuangan bersama ketua dan bendahara', 'Mingguan', 10], [6, 'Integritas', 'Memastikan tidak ada penyalahgunaan wewenang, uang, atau keputusan', 'Mingguan', 10], [7, 'Objektivitas', 'Menilai keseriusan pengurus berdasarkan bukti kerja nyata', 'Mingguan', 10], [8, 'Laporan', 'Memberikan laporan hasil pengawasan kepada forum rapat', 'Mingguan', 10], [9, 'Netralitas', 'Tidak memihak kepada satu orang atau kelompok tertentu', 'Mingguan', 10], [10, 'Konstruktif', 'Memberikan masukan membangun, bukan hanya menyalahkan', 'Mingguan', 10] ]
        ];
        $item_stmt = $db->prepare('INSERT INTO app_checklist_items (role_id, no, area, task, frequency, weight) VALUES (?, ?, ?, ?, ?, ?)');
        foreach ($checklists as $role_id => $items) {
            foreach ($items as $item) {
                $item_stmt->execute(array_merge([$role_id], $item));
            }
        }
    }
}

function get_app_data_response(): void
{
    $roles_stmt = db()->query('SELECT id, name, role, focus FROM app_roles');
    $roles = $roles_stmt ? $roles_stmt->fetchAll(PDO::FETCH_ASSOC) : [];

    $checklist_stmt = db()->query('SELECT role_id, no, area, task, frequency, weight FROM app_checklist_items ORDER BY no ASC');
    $checklist_items = $checklist_stmt ? $checklist_stmt->fetchAll(PDO::FETCH_ASSOC) : [];

    $checklists = [];
    foreach ($checklist_items as $item) {
        $role_id = $item['role_id'];
        unset($item['role_id']);
        if (!isset($checklists[$role_id])) {
            $checklists[$role_id] = [];
        }
        $checklists[$role_id][] = $item;
    }

    json_response(['ok' => true, 'members' => $roles, 'checklists' => $checklists]);
}

try {
    // Optimasi: Hanya jalankan pembuatan tabel jika tabel belum ada untuk mengurangi beban database
    try {
        db()->query('SELECT 1 FROM app_state LIMIT 1');
        db()->query('SELECT 1 FROM app_roles LIMIT 1');
    } catch (PDOException $e) {
        ensure_state_table();
        ensure_app_data_tables();
    }

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        if (($_GET['action'] ?? '') === 'cashflow-file') {
            cashflow_file_response();
        }

        if (($_GET['action'] ?? '') === 'get_app_data') {
            get_app_data_response();
        }

        if (($_GET['action'] ?? '') === 'list_backups') {
            $backupDir = __DIR__ . '/backups';
            $files = [];
            if (is_dir($backupDir)) {
                foreach (glob($backupDir . '/backup_*.sql') as $file) {
                    $files[] = [
                        'name' => basename($file),
                        'size' => filesize($file),
                        'time' => filemtime($file)
                    ];
                }
            }
            usort($files, function($a, $b) { return $b['time'] <=> $a['time']; });
            json_response(['ok' => true, 'backups' => $files]);
        }

        if (($_GET['action'] ?? '') === 'download_backup') {
            $file = $_GET['file'] ?? '';
            // Validasi nama file ketat untuk mencegah serangan path traversal (seperti ../../)
            if (preg_match('/^backup_[0-9_A-Za-z-]+\.sql$/', $file)) {
                $path = __DIR__ . '/backups/' . $file;
                if (file_exists($path)) {
                    while (ob_get_level()) { ob_end_clean(); }
                    header('Content-Type: application/sql');
                    header('Content-Length: ' . filesize($path));
                    header('Content-Disposition: attachment; filename="' . $file . '"');
                    header('Cache-Control: no-store, max-age=0');
                    readfile($path);
                    exit;
                }
            }
            json_response(['ok' => false, 'error' => 'File tidak ditemukan atau akses ditolak.'], 404);
        }

        if (($_GET['action'] ?? '') === 'generate_backup') {
            $backupDir = __DIR__ . '/backups';
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
                $files = glob($backupDir . '/backup_*.sql');
                foreach ($files as $file) {
                    if (is_file($file) && time() - filemtime($file) > 7 * 24 * 60 * 60) {
                        unlink($file);
                    }
                }
                json_response(['ok' => true]);
            } catch (Throwable $e) {
                error_log('Backup Error: ' . $e->getMessage());
                json_response(['ok' => false, 'error' => 'Backup gagal: ' . $e->getMessage()], 500);
            }
        }

        $row = load_state_row();
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
    error_log('API Error: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    json_response(['ok' => false, 'error' => 'Database Error: ' . $e->getMessage()], 500);
}
