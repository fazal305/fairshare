<?php

namespace Tests\Feature;

use App\Models\Bill;
use App\Models\Participant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class StripeWebhookTest extends TestCase
{
    use RefreshDatabase;

    private Bill $bill;

    private Participant $ali;

    protected function setUp(): void
    {
        parent::setUp();
        $host = User::factory()->create();
        $this->bill = new Bill(['title' => 'Dinner', 'currency' => 'PKR', 'status' => 'open', 'tax' => 0]);
        $this->bill->host()->associate($host)->save();
        $item = $this->bill->items()->create(['name' => 'Biryani', 'price' => 4500]);
        $this->ali = $this->bill->participants()->create(['nickname' => 'Ali', 'token_hash' => Participant::hashToken('t')]);
        $this->ali->items()->attach($item);
    }

    private function event(string $id, int $amount, string $currency = 'pkr', ?int $participantId = null): string
    {
        return json_encode([
            'id' => $id,
            'type' => 'checkout.session.completed',
            'data' => ['object' => [
                'id' => 'cs_test_1',
                'payment_status' => 'paid',
                'payment_intent' => 'pi_test_1',
                'amount_total' => $amount,
                'currency' => $currency,
                'metadata' => [
                    'bill_id' => (string) $this->bill->id,
                    'participant_id' => (string) ($participantId ?? $this->ali->id),
                    'amount' => '4500',
                ],
            ]],
        ]);
    }

    private function send(string $payload, ?string $secret = 'whsec_test_secret', ?int $time = null)
    {
        $t = $time ?? time();
        $sig = hash_hmac('sha256', "$t.$payload", $secret);

        return $this->call('POST', '/api/webhooks/stripe', [], [], [], [
            'HTTP_STRIPE_SIGNATURE' => "t=$t,v1=$sig",
            'CONTENT_TYPE' => 'application/json',
        ], $payload);
    }

    public function test_valid_payment_marks_participant_paid_and_notifies_host(): void
    {
        $this->send($this->event('evt_1', 4500))->assertOk();

        $this->ali->refresh();
        $this->assertSame(Participant::COMPLETED, $this->ali->payment_status);
        $this->assertSame(4500, $this->ali->amount_paid);
        $this->assertSame('pi_test_1', $this->ali->transaction_reference);
        $this->assertSame(1, $this->bill->host->notifications()->count());
    }

    public function test_rejects_bad_signatures_and_stale_timestamps(): void
    {
        $this->send($this->event('evt_1', 4500), 'whsec_wrong')->assertStatus(400);
        $this->send($this->event('evt_2', 4500), time: time() - 3600)->assertStatus(400);

        $this->assertSame(Participant::PENDING, $this->ali->fresh()->payment_status);
    }

    public function test_replayed_events_are_processed_once(): void
    {
        $payload = $this->event('evt_dupe', 4500);
        $this->send($payload)->assertOk();
        $this->send($payload)->assertOk();

        $this->assertSame(1, $this->bill->host->notifications()->count());
    }

    public function test_amount_or_currency_mismatch_does_not_mark_paid(): void
    {
        $this->send($this->event('evt_a', 100))->assertOk();
        $this->send($this->event('evt_b', 4500, 'usd'))->assertOk();
        $this->send($this->event('evt_c', 4500, 'pkr', 999))->assertOk();

        $this->assertSame(Participant::PENDING, $this->ali->fresh()->payment_status);
    }

    public function test_card_checkout_charges_the_computed_share(): void
    {
        Http::fake(['api.stripe.com/*' => Http::response(['url' => 'https://checkout.stripe.com/c/pay/cs_test_1'])]);

        $this->postJson("/api/s/{$this->bill->public_id}/pay/card", [], ['X-Participant-Token' => 't'])
            ->assertOk()->assertJsonPath('url', 'https://checkout.stripe.com/c/pay/cs_test_1');

        Http::assertSent(fn ($req) => $req['line_items'][0]['price_data']['unit_amount'] === 4500
            && $req['metadata']['participant_id'] === (string) $this->ali->id
            && str_starts_with($req['success_url'], 'https://fairshare.test/s/'));
    }

    public function test_stripe_errors_are_not_leaked_to_guests(): void
    {
        Http::fake(['api.stripe.com/*' => Http::response(['error' => ['message' => 'Invalid API Key provided: sk_test_***']], 401)]);

        $this->postJson("/api/s/{$this->bill->public_id}/pay/card", [], ['X-Participant-Token' => 't'])
            ->assertStatus(502)
            ->assertJsonMissingPath('error')
            ->assertSee('couldn', false)
            ->assertDontSee('sk_test');
    }
}
