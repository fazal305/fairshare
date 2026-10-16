<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Bill;
use App\Models\Participant;
use App\Models\PaymentEvent;
use App\Notifications\BillActivity;
use App\Services\StripeGateway;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * FR-4.3: verify signature → dedupe by event id → cross-check the amount and
 * currency against what we asked Stripe to charge → mark paid and notify.
 */
class StripeWebhookController extends Controller
{
    private const HANDLED = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'];

    public function __invoke(Request $request, StripeGateway $stripe): JsonResponse
    {
        $payload = $request->getContent();
        if (! $stripe->verifySignature($payload, $request->header('Stripe-Signature'))) {
            return response()->json(['error' => 'invalid signature'], 400);
        }

        $event = json_decode($payload, true);
        if (! is_array($event) || empty($event['id']) || empty($event['type'])) {
            return response()->json(['error' => 'malformed event'], 400);
        }
        if (! in_array($event['type'], self::HANDLED, true)) {
            return response()->json(['ok' => true]);
        }

        try {
            DB::transaction(function () use ($event) {
                PaymentEvent::create(['provider' => 'stripe', 'event_id' => $event['id'], 'type' => $event['type']]);
                $this->apply($event['data']['object'] ?? []);
            });
        } catch (UniqueConstraintViolationException) {
            // Already processed: Stripe retries are expected.
        }

        return response()->json(['ok' => true]);
    }

    private function apply(array $session): void
    {
        if (($session['payment_status'] ?? null) !== 'paid') {
            return;
        }

        $meta = $session['metadata'] ?? [];
        $participant = Participant::with('bill.host')
            ->whereKey((int) ($meta['participant_id'] ?? 0))
            ->where('bill_id', (int) ($meta['bill_id'] ?? 0))
            ->lockForUpdate()
            ->first();

        /** @var Bill|null $bill */
        $bill = $participant?->bill;
        $amount = (int) ($session['amount_total'] ?? -1);
        $currency = strtoupper((string) ($session['currency'] ?? ''));

        if (! $participant || $amount !== (int) ($meta['amount'] ?? -2) || $currency !== $bill->currency) {
            Log::warning('Stripe payment did not match a participant', [
                'session' => $session['id'] ?? null,
                'participant' => $meta['participant_id'] ?? null,
                'amount' => $amount,
                'currency' => $currency,
            ]);

            return;
        }
        if ($participant->isPaid()) {
            return;
        }

        $participant->update([
            'payment_status' => Participant::COMPLETED,
            'payment_method' => 'card',
            'amount_paid' => $amount,
            'transaction_reference' => mb_substr((string) ($session['payment_intent'] ?? $session['id'] ?? ''), 0, 120),
            'paid_at' => now(),
        ]);
        $bill->touch();
        $bill->host->notify(new BillActivity($bill, $participant, BillActivity::CARD_PAID, $amount));
    }
}
