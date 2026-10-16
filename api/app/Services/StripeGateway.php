<?php

namespace App\Services;

use App\Models\Bill;
use App\Models\Participant;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Minimal Stripe Checkout client over the REST API. Card details are entered
 * on Stripe's hosted page, so they never reach this server (PCI SAQ A).
 */
class StripeGateway
{
    private const SIGNATURE_TOLERANCE = 300;

    public function __construct(
        private readonly ?string $secret,
        private readonly ?string $webhookSecret,
        private readonly string $frontendUrl,
    ) {}

    public function enabled(): bool
    {
        return filled($this->secret) && filled($this->webhookSecret);
    }

    /** @return string|null the hosted Checkout URL, or null if Stripe refused */
    public function createCheckout(Bill $bill, Participant $participant, int $amount): ?string
    {
        $back = $this->frontendUrl.'/s/'.$bill->public_id;

        $response = Http::asForm()
            ->withBasicAuth((string) $this->secret, '')
            ->timeout(15)
            ->post('https://api.stripe.com/v1/checkout/sessions', [
                'mode' => 'payment',
                'success_url' => $back.'?payment=success',
                'cancel_url' => $back.'?payment=cancelled',
                'client_reference_id' => (string) $participant->id,
                'line_items' => [[
                    'quantity' => 1,
                    'price_data' => [
                        'currency' => strtolower($bill->currency),
                        'unit_amount' => $amount,
                        'product_data' => ['name' => mb_substr("Your share of {$bill->title}", 0, 250)],
                    ],
                ]],
                'metadata' => [
                    'bill_id' => (string) $bill->id,
                    'participant_id' => (string) $participant->id,
                    'amount' => (string) $amount,
                ],
            ]);

        if (! $response->successful()) {
            Log::warning('Stripe checkout creation failed', [
                'status' => $response->status(),
                'error' => $response->json('error.message'),
            ]);

            return null;
        }

        return $response->json('url');
    }

    /** Verifies the Stripe-Signature header (HMAC-SHA256, timing-safe). */
    public function verifySignature(string $payload, ?string $header, ?int $now = null): bool
    {
        if (! filled($this->webhookSecret) || ! $header) {
            return false;
        }

        $timestamp = null;
        $signatures = [];
        foreach (explode(',', $header) as $part) {
            [$key, $value] = array_pad(explode('=', trim($part), 2), 2, '');
            if ($key === 't') {
                $timestamp = ctype_digit($value) ? (int) $value : null;
            } elseif ($key === 'v1') {
                $signatures[] = $value;
            }
        }

        if ($timestamp === null || abs(($now ?? time()) - $timestamp) > self::SIGNATURE_TOLERANCE) {
            return false;
        }

        $expected = hash_hmac('sha256', $timestamp.'.'.$payload, (string) $this->webhookSecret);
        foreach ($signatures as $signature) {
            if (hash_equals($expected, $signature)) {
                return true;
            }
        }

        return false;
    }
}
