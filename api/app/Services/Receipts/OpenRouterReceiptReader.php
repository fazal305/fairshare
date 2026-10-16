<?php

namespace App\Services\Receipts;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Reads receipts with a vision model through an OpenAI-compatible API
 * (OpenRouter free models by default). Each configured model is tried in turn
 * because free models are often rate-limited.
 */
class OpenRouterReceiptReader implements ReceiptReader
{
    private const PROMPT = <<<'TXT'
You read photos of restaurant and shop receipts. Copy names and numbers exactly as printed.
Reply with one JSON object and nothing else:
{
  "isReceipt": boolean,
  "currency": string | null,         // ISO 4217 code if a symbol or code is printed (Rs → PKR), else null
  "items": [ { "name": string, "quantity": number, "lineTotal": number } ],
  "subtotal": number | null,         // printed subtotal before tax and charges
  "tax": number,                     // all taxes added together (GST, VAT, sales tax), 0 if none
  "serviceCharge": number,           // service charge or fees, 0 if none
  "tip": number,                     // tip or gratuity already printed, 0 if none
  "discount": number                 // total discounts as a positive number, 0 if none
}
"lineTotal" is the amount printed for that line (quantity × unit price), not the unit price.
Do not list subtotal, tax, charges, discounts, totals, payments or change as items.
TXT;

    /** @param string[] $models */
    public function __construct(
        private readonly string $apiKey,
        private readonly string $baseUrl,
        private readonly array $models,
        private readonly int $timeout,
    ) {}

    public function read(string $jpegBytes): array
    {
        $deadline = microtime(true) + $this->timeout;
        $image = 'data:image/jpeg;base64,'.base64_encode($jpegBytes);
        $lastError = 'no model attempted';

        foreach ($this->models as $model) {
            $remaining = (int) floor($deadline - microtime(true));
            if ($remaining < 3) {
                break;
            }
            try {
                $response = Http::withToken($this->apiKey)
                    ->timeout($remaining)
                    ->withHeaders(['X-Title' => 'FairShare'])
                    ->post(rtrim($this->baseUrl, '/').'/chat/completions', [
                        'model' => $model,
                        'temperature' => 0,
                        'messages' => [
                            ['role' => 'system', 'content' => self::PROMPT],
                            ['role' => 'user', 'content' => [
                                ['type' => 'text', 'text' => 'Read this receipt and reply with the JSON object.'],
                                ['type' => 'image_url', 'image_url' => ['url' => $image]],
                            ]],
                        ],
                    ]);
            } catch (ConnectionException $e) {
                $lastError = "$model: ".$e->getMessage();

                continue;
            }

            if (! $response->successful()) {
                $lastError = "$model: HTTP ".$response->status();

                continue;
            }

            $parsed = self::decode((string) $response->json('choices.0.message.content', ''));
            if ($parsed === null) {
                $lastError = "$model: unparseable reply";

                continue;
            }
            if (($parsed['isReceipt'] ?? true) === false) {
                throw new ReceiptReadFailed('That photo doesn\'t look like a receipt. Try another photo or add the items by hand.');
            }

            return self::normalise($parsed);
        }

        Log::warning('Receipt reading failed', ['error' => $lastError]);

        throw new ReceiptReadFailed('We couldn\'t read that receipt right now. Add the items by hand, or try again in a minute.', $lastError);
    }

    public static function decode(string $content): ?array
    {
        if (preg_match('/\{.*\}/s', $content, $m)) {
            $content = $m[0];
        }
        $data = json_decode($content, true);

        return is_array($data) ? $data : null;
    }

    public static function normalise(array $data): array
    {
        $money = fn ($v) => is_numeric($v) ? max(0, (int) round(((float) $v) * 100)) : 0;

        $items = [];
        foreach (array_slice((array) ($data['items'] ?? []), 0, 100) as $row) {
            if (! is_array($row)) {
                continue;
            }
            $name = trim(mb_substr(strip_tags((string) ($row['name'] ?? '')), 0, 120));
            $price = $money($row['lineTotal'] ?? $row['price'] ?? null);
            $qty = (int) round((float) ($row['quantity'] ?? 1));
            if ($name === '' || $price === 0) {
                continue;
            }
            if ($qty > 1 && ! preg_match('/^\d+\s*[x×]/iu', $name)) {
                $name = mb_substr("{$qty} × {$name}", 0, 120);
            }
            $items[] = ['name' => $name, 'price' => $price];
        }

        $currency = strtoupper((string) ($data['currency'] ?? ''));

        return [
            'items' => $items,
            'subtotal' => is_numeric($data['subtotal'] ?? null) ? $money($data['subtotal']) : null,
            'tax' => $money($data['tax'] ?? 0),
            'service_charge' => $money($data['serviceCharge'] ?? 0),
            'tip' => $money($data['tip'] ?? 0),
            'discount' => $money($data['discount'] ?? 0),
            'currency' => preg_match('/^[A-Z]{3}$/', $currency) ? $currency : null,
        ];
    }
}
