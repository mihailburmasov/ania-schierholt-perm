<?php
// Приём заявок с сайта: корзина, «перезвоните», вопрос о товаре.
// Настройки — в config.php рядом (образец: config.sample.php). Ответ — JSON {ok, id}.
declare(strict_types=1);
date_default_timezone_set('Asia/Yekaterinburg'); // Пермь, UTC+5
header('Content-Type: application/json; charset=utf-8');
header('X-Robots-Tag: noindex');

function out(array $r, int $code = 200): void { http_response_code($code); echo json_encode($r, JSON_UNESCAPED_UNICODE); exit; }
function clean(string $s, int $max = 500): string { return mb_substr(trim(strip_tags($s)), 0, $max); }
function h(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['ok' => false, 'error' => 'method'], 405);
$cfgFile = __DIR__ . '/config.php';
if (!is_file($cfgFile)) out(['ok' => false, 'error' => 'config'], 500);
$cfg = require $cfgFile;

// Ловушка для ботов: скрытое поле заполняют только они. Отвечаем «успешно», ничего не отправляя.
if (!empty($_POST['website'])) out(['ok' => true, 'id' => '0']);

$type    = in_array($_POST['type'] ?? '', ['order', 'callback', 'question'], true) ? $_POST['type'] : 'callback';
$name    = clean($_POST['name'] ?? '', 100);
$phone   = clean($_POST['phone'] ?? '', 40);
$city    = clean($_POST['city'] ?? '', 100);
$delivery= clean($_POST['delivery'] ?? '', 100);
$contact = clean($_POST['contact'] ?? '', 40);
$comment = clean($_POST['comment'] ?? '', 2000);
$source  = clean($_POST['source'] ?? '', 200);
$page    = clean($_POST['page'] ?? '', 500);
$consent = ($_POST['consent'] ?? '') === '1';

if (mb_strlen($name) < 2 || strlen(preg_replace('/\D/', '', $phone)) < 10) out(['ok' => false, 'error' => 'fields'], 422);
if (!$consent) out(['ok' => false, 'error' => 'consent'], 422);

// Простое ограничение частоты: не больше 5 заявок с одного IP за 10 минут
$logDir = $cfg['log_dir'] ?? (__DIR__ . '/orders');
if (!is_dir($logDir)) { @mkdir($logDir, 0750, true); @file_put_contents($logDir . '/.htaccess', "Require all denied\nDeny from all\n"); }
$ip = $_SERVER['REMOTE_ADDR'] ?? '';
$rateFile = $logDir . '/.rate-' . md5($ip);
$hits = array_filter(is_file($rateFile) ? (array) json_decode((string) file_get_contents($rateFile), true) : [], fn($t) => $t > time() - 600);
if (count($hits) >= 5) out(['ok' => false, 'error' => 'rate'], 429);
$hits[] = time();
@file_put_contents($rateFile, json_encode(array_values($hits)));

$items = [];
if ($type === 'order') {
    $raw = json_decode((string) ($_POST['items'] ?? '[]'), true);
    foreach (is_array($raw) ? array_slice($raw, 0, 50) : [] as $it) {
        $items[] = [
            'article' => clean((string) ($it['article'] ?? ''), 40),
            'title'   => clean((string) ($it['title'] ?? ''), 150),
            'color'   => clean((string) ($it['color'] ?? ''), 60),
            'size'    => clean((string) ($it['size'] ?? ''), 60),
            'length'  => clean((string) ($it['length'] ?? ''), 40),
            'qty'     => max(1, min(20, (int) ($it['qty'] ?? 1))),
            'price'   => is_numeric($it['price'] ?? null) ? (int) $it['price'] : null,
            'url'     => filter_var($it['url'] ?? '', FILTER_VALIDATE_URL) ?: '',
        ];
    }
    if (!$items) out(['ok' => false, 'error' => 'empty'], 422);
}
$utmFirst = json_decode((string) ($_POST['utm_first'] ?? '{}'), true) ?: [];
$utmLast  = json_decode((string) ($_POST['utm_last'] ?? '{}'), true) ?: [];
$utmText = function (array $u): string {
    $parts = [];
    foreach (['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid', 'landing', 'referrer'] as $k)
        if (!empty($u[$k])) $parts[] = $k . '=' . clean((string) $u[$k], 200);
    return $parts ? implode(', ', $parts) : '—';
};

$id = date('ymd-Hi') . '-' . random_int(10, 99);
$titles = ['order' => 'Запрос на покупку', 'callback' => 'Обратный звонок', 'question' => 'Вопрос о товаре'];
$subject = $titles[$type] . ' №' . $id . ' — ' . $name;

// ---- письмо ----
$rows = [
    'Имя' => $name, 'Телефон' => $phone, 'Город' => $city, 'Получение' => $delivery, 'Связаться' => $contact,
    'Комментарий' => $comment, 'Форма' => $source, 'Страница' => $page,
];
$html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">';
$html .= '<h2 style="margin:0 0 12px">' . h($titles[$type]) . ' №' . h($id) . '</h2>';
$html .= '<table cellpadding="6" style="border-collapse:collapse">';
foreach ($rows as $k => $v) if ($v !== '') $html .= '<tr><td style="color:#777">' . h($k) . '</td><td><b>' . nl2br(h($v)) . '</b></td></tr>';
$html .= '</table>';
$text = $titles[$type] . " №$id\n";
foreach ($rows as $k => $v) if ($v !== '') $text .= "$k: $v\n";
if ($items) {
    $sum = 0; $allPriced = true;
    $html .= '<h3 style="margin:20px 0 8px">Товары</h3><table cellpadding="6" border="1" style="border-collapse:collapse;border-color:#ddd">';
    $html .= '<tr style="background:#f3f0ea"><th>Артикул</th><th>Модель</th><th>Цвет</th><th>Размер</th><th>Длина</th><th>Кол-во</th><th>Цена</th></tr>';
    $text .= "\nТовары:\n";
    foreach ($items as $it) {
        if ($it['price']) $sum += $it['price'] * $it['qty']; else $allPriced = false;
        $price = $it['price'] ? number_format($it['price'], 0, '', ' ') . ' ₽' : 'по запросу';
        $html .= '<tr><td>' . h($it['article']) . '</td><td>' . ($it['url'] ? '<a href="' . h($it['url']) . '">' . h($it['title']) . '</a>' : h($it['title'])) . '</td><td>' . h($it['color']) . '</td><td>' . h($it['size']) . '</td><td>' . h($it['length'] ?: '—') . '</td><td>' . $it['qty'] . '</td><td>' . $price . '</td></tr>';
        $text .= "— {$it['article']} {$it['title']}, {$it['color']}, размер: {$it['size']}" . ($it['length'] ? ", длина: {$it['length']}" : '') . ", {$it['qty']} шт., $price\n";
    }
    $html .= '</table>';
    if ($sum) { $line = 'Сумма' . ($allPriced ? '' : ' (без позиций с ценой по запросу)') . ': ' . number_format($sum, 0, '', ' ') . ' ₽'; $html .= '<p><b>' . h($line) . '</b></p>'; $text .= "$line\n"; }
}
$html .= '<p style="color:#888;font-size:12px;margin-top:20px">Источник (первый визит): ' . h($utmText($utmFirst)) . '<br>Источник (последний визит): ' . h($utmText($utmLast)) . '<br>IP: ' . h($ip) . '</p></div>';
$text .= "\nИсточник (первый визит): " . $utmText($utmFirst) . "\nИсточник (последний визит): " . $utmText($utmLast) . "\n";

// ---- журнал (резерв на случай сбоя почты) ----
// Файл с расширением .php и exit в первой строке не отдаётся наружу ни Apache, ни nginx
$logFile = $logDir . '/' . date('Y-m') . '.log.php';
if (!is_file($logFile)) @file_put_contents($logFile, "<?php exit; ?>
");
@file_put_contents($logFile, json_encode([
    'id' => $id, 'at' => date('c'), 'type' => $type, 'name' => $name, 'phone' => $phone, 'city' => $city,
    'delivery' => $delivery, 'contact' => $contact, 'comment' => $comment, 'items' => $items,
    'source' => $source, 'page' => $page, 'utm_first' => $utmFirst, 'utm_last' => $utmLast, 'ip' => $ip,
], JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);

$sent = false;
foreach ((array) ($cfg['mail_to'] ?? []) as $to) {
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) continue;
    $sent = (!empty($cfg['smtp']['host']) ? smtp_send($cfg, $to, $subject, $html) : php_mail($cfg, $to, $subject, $html)) || $sent;
}
if (!empty($cfg['telegram']['token']) && !empty($cfg['telegram']['chat_id'])) {
    $sent = telegram($cfg['telegram'], mb_substr($subject . "\n\n" . $text, 0, 4000)) || $sent;
}
// Режим проверки без почты: заявка считается принятой, если записана в журнал
// Работает только на localhost: случайно выложенный тестовый config не «съест» реальные заявки
$isLocal = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true) && in_array($_SERVER['SERVER_NAME'] ?? '', ['localhost', '127.0.0.1'], true);
if (!$sent && !empty($cfg['log_only']) && $isLocal) $sent = true;
out($sent ? ['ok' => true, 'id' => $id] : ['ok' => false, 'error' => 'send', 'id' => $id], $sent ? 200 : 502);

// ---------- отправка ----------
function php_mail(array $cfg, string $to, string $subject, string $html): bool {
    $from = $cfg['mail_from'] ?? ('no-reply@' . ($_SERVER['HTTP_HOST'] ?? 'localhost'));
    $headers = "MIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\nFrom: =?UTF-8?B?" . base64_encode($cfg['from_name'] ?? 'Сайт') . "?= <$from>\r\n";
    return @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $html, $headers);
}

function smtp_send(array $cfg, string $to, string $subject, string $html): bool {
    $s = $cfg['smtp'];
    $fp = @stream_socket_client(($s['secure'] ?? 'ssl') === 'ssl' ? "ssl://{$s['host']}:{$s['port']}" : "tcp://{$s['host']}:{$s['port']}", $en, $es, 15);
    if (!$fp) return false;
    stream_set_timeout($fp, 15);
    $read = function () use ($fp): string { $r = ''; while (($l = fgets($fp, 515)) !== false) { $r .= $l; if (isset($l[3]) && $l[3] === ' ') break; } return $r; };
    $cmd = function (string $c, string $expect) use ($fp, $read): bool { fwrite($fp, $c . "\r\n"); return strpos($read(), $expect) === 0; };
    $read();
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    if (!$cmd("EHLO $host", '250')) return false;
    if (($s['secure'] ?? 'ssl') === 'tls') {
        if (!$cmd('STARTTLS', '220') || !stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT) || !$cmd("EHLO $host", '250')) return false;
    }
    if (!$cmd('AUTH LOGIN', '334') || !$cmd(base64_encode($s['user']), '334') || !$cmd(base64_encode($s['pass']), '235')) return false;
    $from = $cfg['mail_from'] ?? $s['user'];
    if (!$cmd("MAIL FROM:<$from>", '250') || !$cmd("RCPT TO:<$to>", '25') || !$cmd('DATA', '354')) return false;
    $msg = 'Date: ' . date('r') . "\r\nFrom: =?UTF-8?B?" . base64_encode($cfg['from_name'] ?? 'Сайт') . "?= <$from>\r\nTo: <$to>\r\nSubject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html));
    $ok = $cmd($msg . "\r\n.", '250');
    $cmd('QUIT', '221');
    fclose($fp);
    return $ok;
}

function telegram(array $t, string $text): bool {
    $ctx = stream_context_create(['http' => ['method' => 'POST', 'timeout' => 10, 'header' => "Content-Type: application/json\r\n",
        'content' => json_encode(['chat_id' => $t['chat_id'], 'text' => $text, 'disable_web_page_preview' => true])]]);
    $r = @file_get_contents('https://api.telegram.org/bot' . $t['token'] . '/sendMessage', false, $ctx);
    return $r !== false && !empty(json_decode($r, true)['ok']);
}
