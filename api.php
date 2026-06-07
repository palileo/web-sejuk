<?php
declare(strict_types=1);

ini_set('display_errors', '1');
error_reporting(E_ALL);
ob_start();

require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

function json_response(array $payload, int $status = 200): void
{
    http_response_code($status);
    while (ob_get_level()) {
        ob_end_clean();
    }
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// --- PROTEKSI DOMAIN (CORS & Anti-Hotlinking) ---
$allowed_domain = 'mak.indosejuk.my.id';
$allowed_origin = 'https://' . $allowed_domain;

// Pengecualian: Izinkan localhost jika kamu sedang testing aplikasi di komputermu sendiri
$is_localhost = in_array($_SERVER['HTTP_HOST'] ?? '', ['localhost', 'localhost:8000', '127.0.0.1:8000']);

if (!$is_localhost) {
    $host = $_SERVER['HTTP_HOST'] ?? '';
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $referer = $_SERVER['HTTP_REFERER'] ?? '';

    if ($host !== $allowed_domain) {
        json_response(['ok' => false, 'error' => 'Akses Ditolak: Host tidak diizinkan.'], 403);
    }
    if ($origin !== '' && $origin !== $allowed_origin) {
        json_response(['ok' => false, 'error' => 'Akses Ditolak: Origin tidak diizinkan.'], 403);
    }
    if ($referer !== '' && strpos($referer, $allowed_origin . '/') !== 0 && $referer !== $allowed_origin) {
        json_response(['ok' => false, 'error' => 'Akses Ditolak: Referer tidak diizinkan.'], 403);
    }
}
// ------------------------------------------------

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

function state_revision(?array $row): ?string
{
    if (!$row || !isset($row['state_json'])) {
        return null;
    }
    return hash('sha256', (string) $row['state_json']);
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

    $match = [];
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
    $defaultRoles = [
        ['ketua', 'Ketua Pengurus', 'Ketua Pengurus', 'Arah organisasi, keputusan, pengawasan'],
        ['marketing', 'Manager Marketing', 'Manager Marketing', 'Pemasaran, penjualan, pasar, harga produk'],
        ['sekretaris', 'Sekretaris Umum', 'Sekretaris Umum', 'Administrasi, notulen, arsip, evaluasi'],
        ['bendahara', 'Bendahara Umum', 'Bendahara Umum', 'Keuangan, kas, laporan, pembagian hasil'],
        ['operasional', 'Manager Operasional', 'Manager Lapangan / Operasional', 'Alur kerja, tugas lapangan, operasional'],
        ['pengawas', 'Pengawas Koperasi', 'Pengawas Koperasi', 'Pengawasan pengurus, evaluasi kerja, transparansi, kontrol organisasi']
    ];
    $defaultChecklists = [
        'ketua' => [ [1, 'Kepemimpinan', 'Aktif memimpin rapat koperasi', 'Mingguan', 10], [2, 'Kepemimpinan', 'Menetapkan arah organisasi secara jelas', 'Mingguan', 10], [3, 'Keputusan', 'Berani mengambil keputusan penting', 'Mingguan', 10], [4, 'Pengawasan', 'Memastikan setiap keputusan rapat dijalankan', 'Mingguan', 10], [5, 'Pengawasan', 'Meminta laporan dari setiap bagian', 'Mingguan', 10], [6, 'Keuangan', 'Mengawasi keuangan bersama bendahara secara rutin', 'Mingguan', 10], [7, 'Koordinasi', 'Menjadi penengah jika terjadi perbedaan pendapat', 'Mingguan', 10], [8, 'Disiplin', 'Tidak membiarkan masalah menggantung', 'Mingguan', 10], [9, 'Disiplin', 'Menegur pengurus yang tidak menjalankan tugas', 'Mingguan', 10], [10, 'Arah Organisasi', 'Menjaga koperasi tetap sesuai prinsip dan tujuan', 'Mingguan', 10] ],
        'marketing' => [ [1, 'Produk/Jasa', 'Membuat daftar produk atau jasa yang akan dipasarkan', 'Mingguan', 10], [2, 'Target', 'Menyusun target penjualan', 'Mingguan', 10], [3, 'Strategi', 'Membuat strategi promosi koperasi', 'Mingguan', 10], [4, 'Pasar', 'Menentukan target pasar', 'Mingguan', 10], [5, 'Mitra', 'Mencari calon pembeli atau mitra', 'Mingguan', 10], [6, 'Harga', 'Membuat aturan harga bersama bendahara dan ketua', 'Mingguan', 10], [7, 'Penjualan', 'Menyusun sistem penjualan yang jelas', 'Mingguan', 10], [8, 'Promosi', 'Membuat agenda promosi rutin', 'Mingguan', 10], [9, 'Laporan', 'Melaporkan perkembangan pasar secara berkala', 'Mingguan', 10], [10, 'Peluang', 'Membawa peluang nyata, bukan hanya ide', 'Mingguan', 10] ],
        'sekretaris' => [ [1, 'Notulen', 'Setiap rapat memiliki notulen tertulis', 'Mingguan', 10], [2, 'Dokumen', 'Menyusun dokumen dasar koperasi', 'Mingguan', 10], [3, 'Keputusan', 'Mencatat keputusan dan pembagian tugas', 'Mingguan', 10], [4, 'Arsip', 'Mengarsipkan data anggota, program, dan kegiatan', 'Mingguan', 10], [5, 'Laporan', 'Membuat format laporan kerja tiap bagian', 'Mingguan', 10], [6, 'Pengingat', 'Mengingatkan pengurus terhadap tugas yang disepakati', 'Mingguan', 10], [7, 'Evaluasi', 'Menyusun indikator evaluasi keseriusan pengurus', 'Mingguan', 10], [8, 'Objektivitas', 'Mencatat perkembangan tiap orang secara objektif', 'Mingguan', 10], [9, 'Sistem', 'Menjaga sistem administrasi tetap rapi', 'Mingguan', 10], [10, 'Akurasi', 'Membedakan janji, rencana, dan tindakan nyata', 'Mingguan', 10] ],
        'bendahara' => [ [1, 'Kas', 'Mencatat seluruh uang masuk dan keluar', 'Mingguan', 10], [2, 'Laporan', 'Membuat laporan kas koperasi', 'Mingguan', 10], [3, 'Bukti', 'Menyimpan bukti transaksi', 'Mingguan', 10], [4, 'Transparansi', 'Laporan keuangan bisa diperiksa', 'Mingguan', 10], [5, 'Pembagian Hasil', 'Menyusun sistem pembagian hasil tertulis', 'Mingguan', 10], [6, 'Anggaran', 'Mengatur pos anggaran kebutuhan mendesak', 'Mingguan', 10], [7, 'Koordinasi', 'Berkoordinasi dengan marketing soal harga dan penjualan', 'Mingguan', 10], [8, 'Koordinasi', 'Berkoordinasi dengan ketua soal pengawasan keuangan', 'Mingguan', 10], [9, 'Disiplin', 'Tidak menunda laporan uang', 'Mingguan', 10], [10, 'Integritas', 'Tidak mencampur uang pribadi dengan uang koperasi', 'Mingguan', 10] ],
        'operasional' => [ [1, 'Tugas Lapangan', 'Membuat daftar tugas lapangan', 'Mingguan', 10], [2, 'Jadwal', 'Menyusun jadwal kerja atau pembagian tugas', 'Mingguan', 10], [3, 'Alur Kerja', 'Menyusun alur kerja dari pesanan sampai penyelesaian', 'Mingguan', 10], [4, 'Pengawasan', 'Mengawasi pelaksanaan tugas di lapangan', 'Mingguan', 10], [5, 'Kendala', 'Melaporkan kendala operasional dengan jelas', 'Mingguan', 10], [6, 'Pemerataan', 'Memastikan pekerjaan tidak dibebankan kepada orang tertentu', 'Mingguan', 10], [7, 'Kerapihan', 'Menjaga kerapihan proses kerja', 'Mingguan', 10], [8, 'Kepatuhan', 'Menjalankan operasional sesuai keputusan rapat', 'Mingguan', 10], [9, 'Kualitas', 'Menghindari kerja asal-asalan', 'Mingguan', 10], [10, 'Laporan', 'Membawa laporan nyata dari lapangan, bukan hanya keluhan', 'Mingguan', 10] ],
        'pengawas' => [ [1, 'Pengawasan', 'Memantau perkembangan kerja setiap pengurus', 'Mingguan', 10], [2, 'Keputusan', 'Memastikan keputusan rapat benar-benar dijalankan', 'Mingguan', 10], [3, 'Pemeriksaan', 'Memeriksa laporan administrasi, keuangan, pemasaran, dan operasional', 'Mingguan', 10], [4, 'Teguran', 'Berani menegur jika ada tugas yang tidak dijalankan', 'Mingguan', 10], [5, 'Transparansi', 'Mengawasi transparansi keuangan bersama ketua dan bendahara', 'Mingguan', 10], [6, 'Integritas', 'Memastikan tidak ada penyalahgunaan wewenang, uang, atau keputusan', 'Mingguan', 10], [7, 'Objektivitas', 'Menilai keseriusan pengurus berdasarkan bukti kerja nyata', 'Mingguan', 10], [8, 'Laporan', 'Memberikan laporan hasil pengawasan kepada forum rapat', 'Mingguan', 10], [9, 'Netralitas', 'Tidak memihak kepada satu orang atau kelompok tertentu', 'Mingguan', 10], [10, 'Konstruktif', 'Memberikan masukan membangun, bukan hanya menyalahkan', 'Mingguan', 10] ]
    ];
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

    $roleCount = (int) $db->query('SELECT COUNT(*) FROM app_roles')->fetchColumn();
    if ($roleCount === 0) {
        $role_stmt = $db->prepare('INSERT INTO app_roles (id, name, role, focus) VALUES (?, ?, ?, ?)');
        foreach ($defaultRoles as $role) {
            $role_stmt->execute($role);
        }
    }

    $itemCount = (int) $db->query('SELECT COUNT(*) FROM app_checklist_items')->fetchColumn();
    if ($itemCount === 0) {
        $existingRoleIds = $db->query('SELECT id FROM app_roles')->fetchAll(PDO::FETCH_COLUMN) ?: [];
        $existingRoleLookup = array_fill_keys($existingRoleIds, true);
        $item_stmt = $db->prepare('INSERT INTO app_checklist_items (role_id, no, area, task, frequency, weight) VALUES (?, ?, ?, ?, ?, ?)');
        foreach ($defaultChecklists as $role_id => $items) {
            if (!isset($existingRoleLookup[$role_id])) {
                continue;
            }
            foreach ($items as $item) {
                $item_stmt->execute(array_merge([$role_id], $item));
            }
        }
    }
}

function fetch_app_data(): array
{
    $roles_stmt = db()->query("
        SELECT id, name, role, focus
        FROM app_roles
        ORDER BY CASE id
            WHEN 'ketua' THEN 1
            WHEN 'marketing' THEN 2
            WHEN 'sekretaris' THEN 3
            WHEN 'bendahara' THEN 4
            WHEN 'operasional' THEN 5
            WHEN 'pengawas' THEN 6
            ELSE 99
        END, id ASC
    ");
    $roles = $roles_stmt ? $roles_stmt->fetchAll(PDO::FETCH_ASSOC) : [];

    $checklist_stmt = db()->query('SELECT role_id, no, area, task, frequency, weight FROM app_checklist_items ORDER BY role_id ASC, no ASC');
    $checklist_items = $checklist_stmt ? $checklist_stmt->fetchAll(PDO::FETCH_ASSOC) : [];

    $checklists = new stdClass();
    foreach ($checklist_items as $item) {
        $role_id = $item['role_id'];
        unset($item['role_id']);
        $item['no'] = (int) $item['no'];
        $item['weight'] = (int) $item['weight'];
        if (!isset($checklists->$role_id)) {
            $checklists->$role_id = [];
        }
        $checklists->$role_id[] = $item;
    }

    return ['members' => $roles, 'checklists' => $checklists];
}

function normalize_checklist_item(array $item): array
{
    return [
        'no' => max(0, (int) ($item['no'] ?? 0)),
        'area' => trim((string) ($item['area'] ?? '')),
        'task' => trim((string) ($item['task'] ?? '')),
        'frequency' => trim((string) ($item['frequency'] ?? '')),
        'weight' => (int) ($item['weight'] ?? 0),
    ];
}

function normalize_checklists_payload(array $payloadChecklists): array
{
    $normalized = [];
    foreach ($payloadChecklists as $role_id => $items) {
        if (!is_array($items)) {
            continue;
        }
        $cleanItems = [];
        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }
            $normalizedItem = normalize_checklist_item($item);
            if ($normalizedItem['no'] <= 0 || $normalizedItem['task'] === '') {
                continue;
            }
            $cleanItems[] = $normalizedItem;
        }
        usort($cleanItems, static function (array $a, array $b): int {
            return $a['no'] <=> $b['no'];
        });
        $normalized[(string) $role_id] = $cleanItems;
    }
    return $normalized;
}

function get_app_data_response(): void
{
    $appData = fetch_app_data();
    json_response(array_merge(['ok' => true], $appData));
}

function get_item_time($item): int
{
    if (!is_array($item)) return 0;
    // Cari atribut waktu (yang mana saja yang tersedia di objek)
    $t = $item['timestamp'] ?? $item['updatedAt'] ?? $item['submittedAt'] ?? $item['approvedAt'] ?? $item['createdAt'] ?? 0;
    return is_string($t) ? (strtotime($t) ?: 0) : (int) $t;
}

function merge_objects_with_tombstones(array $current, array $incoming): array
{
    $merged = [];
    $allKeys = array_unique(array_merge(array_keys($current), array_keys($incoming)));

    foreach ($allKeys as $key) {
        $currItem = $current[$key] ?? null;
        $incItem = $incoming[$key] ?? null;

        if ($currItem === null) { $merged[$key] = $incItem; continue; }
        if ($incItem === null) { $merged[$key] = $currItem; continue; }

        $currTime = get_item_time($currItem);
        $incTime = get_item_time($incItem);

        // Data dengan timestamp paling baru yang akan disimpan (hidup ataupun _deleted)
        $merged[$key] = ($incTime >= $currTime) ? $incItem : $currItem;
    }
    return $merged;
}

function merge_states(array $current, array $incoming): array
{
    // Mulai dengan state saat ini di server sebagai dasar
    $merged = $current;

    if (isset($incoming['evaluations']) || isset($current['evaluations'])) {
        $merged['evaluations'] = merge_objects_with_tombstones($current['evaluations'] ?? [], $incoming['evaluations'] ?? []);
    }
    if (isset($incoming['accounts']) || isset($current['accounts'])) {
        $merged['accounts'] = merge_objects_with_tombstones($current['accounts'] ?? [], $incoming['accounts'] ?? []);
    }

    // Untuk array objek seperti 'signupRequests', kita gabungkan berdasarkan ID unik.
    if (isset($incoming['signupRequests'])) {
        $requestsById = [];
        foreach (($current['signupRequests'] ?? []) as $req) $requestsById[$req['id']] = $req;
        foreach ($incoming['signupRequests'] as $req) $requestsById[$req['id']] = $req;
        $merged['signupRequests'] = array_values($requestsById);
    }

    // Untuk nilai tunggal atau objek kompleks yang harus diganti seluruhnya,
    // kita ambil dari '$incoming' karena itu adalah perubahan yang paling baru.
    if (isset($incoming['totalShu'])) $merged['totalShu'] = $incoming['totalShu'];
    if (isset($incoming['shuDistribution'])) $merged['shuDistribution'] = $incoming['shuDistribution'];
    if (isset($incoming['cashFlow'])) $merged['cashFlow'] = $incoming['cashFlow'];

    return $merged;
}

function save_checklists_response(array $payload): void
{
    $db = db();
    $db->beginTransaction();
    try {
        $normalizedChecklists = normalize_checklists_payload(
            isset($payload['checklists']) && is_array($payload['checklists']) ? $payload['checklists'] : []
        );
        $db->exec('DELETE FROM app_checklist_items');
        
        $item_stmt = $db->prepare('INSERT INTO app_checklist_items (role_id, no, area, task, frequency, weight) VALUES (?, ?, ?, ?, ?, ?)');
        foreach ($normalizedChecklists as $role_id => $items) {
            foreach ($items as $item) {
                $item_stmt->execute([$role_id, $item['no'], $item['area'], $item['task'], $item['frequency'], $item['weight']]);
            }
        }
        $db->commit();
        $appData = fetch_app_data();
        json_response([
            'ok' => true,
            'appData' => $appData,
            'appDataRevision' => hash('sha256', json_encode($appData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))
        ]);
    } catch (Throwable $e) {
        $db->rollBack();
        json_response(['ok' => false, 'error' => 'Gagal menyimpan checklist: ' . $e->getMessage()], 500);
    }
}

function add_role_response(array $payload): void
{
    $id = trim((string) ($payload['id'] ?? ''));
    $name = trim((string) ($payload['name'] ?? ''));
    $role = trim((string) ($payload['role'] ?? ''));
    $focus = trim((string) ($payload['focus'] ?? ''));

    if ($id === '' || $name === '' || $role === '') {
        json_response(['ok' => false, 'error' => 'Data jabatan tidak lengkap.'], 400);
    }

    try {
        $stmt = db()->prepare('INSERT INTO app_roles (id, name, role, focus) VALUES (?, ?, ?, ?)');
        $stmt->execute([$id, $name, $role, $focus]);
        $appData = fetch_app_data();
        json_response([
            'ok' => true,
            'appData' => $appData,
            'appDataRevision' => hash('sha256', json_encode($appData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))
        ]);
    } catch (PDOException $e) {
        if ($e->getCode() == 23000 || $e->getCode() == 1062) {
            json_response(['ok' => false, 'error' => 'ID Jabatan sudah ada.'], 400);
        }
        json_response(['ok' => false, 'error' => 'Gagal menyimpan jabatan: ' . $e->getMessage()], 500);
    }
}

function prune_old_tombstones(array $state, int $max_age_seconds = 2592000): array
{
    // Batas waktu: 30 hari (30 * 24 * 60 * 60 = 2592000 detik)
    $threshold = time() - $max_age_seconds;

    $collections = ['accounts', 'evaluations'];
    foreach ($collections as $collection) {
        if (isset($state[$collection]) && is_array($state[$collection])) {
            foreach ($state[$collection] as $key => $item) {
                if (is_array($item) && !empty($item['_deleted'])) {
                    $itemTime = get_item_time($item);
                    // Jika timestamp valid dan usianya lebih tua dari 30 hari
                    if ($itemTime > 0 && $itemTime < $threshold) {
                        // Kadaluarsa: Hapus dari JSON secara fisik
                        unset($state[$collection][$key]);
                    }
                }
            }
        }
    }
    return $state;
}

try {
    ensure_state_table();
    ensure_app_data_tables();

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
        $appData = fetch_app_data();
        $appDataRevision = hash('sha256', json_encode($appData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        json_response([
            'ok' => true,
            'state' => $row ? json_decode((string) $row['state_json'], true) : null,
            'appData' => $appData,
            'appDataRevision' => $appDataRevision,
            'updatedAt' => $row['updated_at'] ?? null,
            'revision' => state_revision($row),
        ]);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (($_GET['action'] ?? '') === 'save_checklists') {
            $raw = file_get_contents('php://input') ?: '';
            $payload = json_decode($raw, true);
            save_checklists_response($payload ?: []);
        }

        if (($_GET['action'] ?? '') === 'add_role') {
            $raw = file_get_contents('php://input') ?: '';
            $payload = json_decode($raw, true);
            add_role_response($payload ?: []);
        }

        $raw = file_get_contents('php://input') ?: '';
        if (strlen($raw) > 12 * 1024 * 1024) {
            json_response(['ok' => false, 'error' => 'Payload terlalu besar.'], 413);
        }

        $payload = json_decode($raw, true);
        if (!is_array($payload) || !isset($payload['state']) || !is_array($payload['state'])) {
            json_response(['ok' => false, 'error' => 'Payload tidak valid.'], 422);
        }

        // Pengecekan Optimistic Concurrency Control (OCC)
        $expectedRevision = $payload['expectedRevision'] ?? null;
        $currentRow = load_state_row();
        $currentRevision = state_revision($currentRow);

        if ($currentRevision !== null && $expectedRevision !== $currentRevision) {
            // Terjadi konflik! Alih-alih menolak, kita coba gabungkan (merge).
            $currentStateData = json_decode((string) $currentRow['state_json'], true);
            $mergedState = merge_states($currentStateData, $payload['state']);
            // Setelah digabung, kita gunakan state hasil gabungan untuk disimpan.
            $payload['state'] = $mergedState;
        }

        // Bersihkan tombstone (batu nisan) yang sudah kedaluwarsa sebelum disimpan ke database
        $payload['state'] = prune_old_tombstones($payload['state']);

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

        $saved = load_state_row();
        json_response(['ok' => true, 'updatedAt' => $saved['updated_at'] ?? null, 'revision' => state_revision($saved)]);
    }

    json_response(['ok' => false, 'error' => 'Metode tidak didukung.'], 405);
} catch (Throwable $e) {
    error_log('API Error: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    json_response(['ok' => false, 'error' => 'Database Error: ' . $e->getMessage()], 500);
}
