<?php

namespace Tests\Feature;

use App\Models\Bill;
use App\Models\User;
use App\Services\Receipts\ReceiptReader;
use App\Services\Receipts\ReceiptReadFailed;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BillFlowTest extends TestCase
{
    use RefreshDatabase;

    private function host(): User
    {
        return User::factory()->create(['bank_details' => [
            'account_title' => 'Sara Khan', 'bank_name' => 'Meezan', 'account_number' => 'PK36MEZN0001234567890',
        ]]);
    }

    private function openBill(User $host): Bill
    {
        Sanctum::actingAs($host);
        $id = $this->postJson('/api/bills', ['title' => 'Kolachi'])->json('bill.id');
        $this->putJson("/api/bills/$id", [
            'title' => 'Kolachi', 'currency' => 'PKR', 'tax' => 1600, 'service_charge' => 400, 'tip' => 0, 'discount' => 0,
            'items' => [
                ['name' => 'Karahi', 'price' => 6000],
                ['name' => 'Naan', 'price' => 1000],
                ['name' => 'Lassi', 'price' => 3000],
            ],
        ])->assertOk();
        $this->postJson("/api/bills/$id/publish")->assertOk();

        return Bill::find($id);
    }

    public function test_register_requires_consent_and_returns_a_token(): void
    {
        $this->postJson('/api/auth/register', ['name' => 'Sara', 'email' => 'sara@example.com', 'password' => 'long-enough-1'])
            ->assertStatus(422)->assertJsonValidationErrors('accept_terms');

        $this->postJson('/api/auth/register', ['name' => 'Sara', 'email' => 'sara@example.com', 'password' => 'long-enough-1', 'accept_terms' => true])
            ->assertCreated()->assertJsonStructure(['token', 'user' => ['id', 'email']]);
    }

    public function test_login_rejects_wrong_password_without_saying_which_part(): void
    {
        User::factory()->create(['email' => 'a@example.com']);

        $this->postJson('/api/auth/login', ['email' => 'a@example.com', 'password' => 'nope'])
            ->assertStatus(422)->assertJsonPath('errors.email.0', 'That email and password don\'t match.');
    }

    public function test_bank_details_are_encrypted_at_rest(): void
    {
        $host = $this->host();
        $raw = \DB::table('users')->where('id', $host->id)->value('bank_details');

        $this->assertStringNotContainsString('PK36MEZN', $raw);
        $this->assertSame('PK36MEZN0001234567890', $host->fresh()->bank_details['account_number']);
    }

    public function test_hosts_cannot_see_each_others_bills(): void
    {
        $bill = $this->openBill($this->host());

        Sanctum::actingAs(User::factory()->create());
        $this->getJson("/api/bills/{$bill->id}")->assertNotFound();
        $this->putJson("/api/bills/{$bill->id}", [])->assertNotFound();
        $this->getJson("/api/bills/{$bill->id}/receipt")->assertNotFound();
    }

    public function test_receipt_upload_rejects_files_that_are_not_really_images(): void
    {
        Storage::fake('local');
        Sanctum::actingAs($this->host());

        $fake = UploadedFile::fake()->createWithContent('receipt.jpg', '<?php echo "hi";');
        $this->postJson('/api/bills', ['receipt' => $fake])
            ->assertStatus(422)->assertJsonValidationErrors('receipt');
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public function test_receipt_upload_is_reencoded_and_read_into_items(): void
    {
        Storage::fake('local');
        $this->app->instance(ReceiptReader::class, new class implements ReceiptReader
        {
            public function read(string $jpegBytes): array
            {
                return [
                    'items' => [['name' => 'Chai', 'price' => 25000], ['name' => 'Samosa', 'price' => 12000]],
                    'subtotal' => 37000, 'tax' => 1000, 'service_charge' => 0, 'tip' => 0, 'discount' => 0, 'currency' => 'PKR',
                ];
            }
        });
        Sanctum::actingAs($this->host());

        $res = $this->postJson('/api/bills', ['receipt' => UploadedFile::fake()->image('r.png', 2400, 3200)])->assertCreated();

        $res->assertJsonPath('bill.ocr_status', 'done')
            ->assertJsonPath('bill.items.0.name', 'Chai')
            ->assertJsonPath('bill.summary.grand_total', 38000);
        [$path] = Storage::disk('local')->allFiles('receipts');
        $this->assertMatchesRegularExpression('#^receipts/[A-Za-z0-9]{40}\.jpg$#', $path);
        [$w, $h] = getimagesizefromstring(Storage::disk('local')->get($path));
        $this->assertSame(1600, max($w, $h));
        $res->assertJsonMissingPath('bill.receipt_path');
    }

    public function test_failed_reading_tells_the_host_to_add_items_by_hand(): void
    {
        Storage::fake('local');
        $this->app->instance(ReceiptReader::class, new class implements ReceiptReader
        {
            public function read(string $jpegBytes): array
            {
                throw new ReceiptReadFailed('We couldn\'t read that receipt right now.', 'HTTP 429');
            }
        });
        Sanctum::actingAs($this->host());

        $this->postJson('/api/bills', ['receipt' => UploadedFile::fake()->image('r.jpg')])
            ->assertCreated()
            ->assertJsonPath('bill.ocr_status', 'failed')
            ->assertJsonPath('bill.ocr_error', 'We couldn\'t read that receipt right now.');
    }

    public function test_draft_bills_are_not_reachable_by_link(): void
    {
        Sanctum::actingAs($this->host());
        $publicId = $this->postJson('/api/bills', ['title' => 'Draft'])->json('bill.public_id');

        $this->getJson("/api/s/$publicId")->assertNotFound();
    }

    public function test_guests_join_claim_shared_items_and_get_proportional_totals(): void
    {
        $bill = $this->openBill($this->host());
        [$karahi, $naan, $lassi] = $bill->items->pluck('id')->all();

        $ali = $this->postJson("/api/s/{$bill->public_id}/join", ['nickname' => 'Ali'])->assertCreated()->json('token');
        $zoya = $this->postJson("/api/s/{$bill->public_id}/join", ['nickname' => 'Zoya'])->json('token');

        $this->postJson("/api/s/{$bill->public_id}/join", ['nickname' => ' ali '])
            ->assertStatus(422)->assertJsonValidationErrors('nickname');

        $this->putJson("/api/s/{$bill->public_id}/claims", ['item_ids' => [$karahi, $naan]], ['X-Participant-Token' => $ali])->assertOk();
        $res = $this->putJson("/api/s/{$bill->public_id}/claims", ['item_ids' => [$naan, $lassi]], ['X-Participant-Token' => $zoya])->assertOk();

        // Items 10,000; fees 2,000 → ×1.2. Ali 6,000 + 500 = 6,500 → 7,800. Zoya 500 + 3,000 = 3,500 → 4,200.
        $res->assertJsonPath('bill.me.subtotal', 3500)->assertJsonPath('bill.me.total', 4200);
        $this->getJson("/api/s/{$bill->public_id}", ['X-Participant-Token' => $ali])->assertJsonPath('bill.me.total', 7800);

        // Guests never see the ledger or other people's payment references.
        $res->assertJsonMissingPath('bill.ledger')->assertJsonMissingPath('bill.participants.0.total');
    }

    public function test_claims_need_a_valid_token_and_ignore_other_bills_items(): void
    {
        $host = $this->host();
        $bill = $this->openBill($host);
        $other = $this->openBill($host);

        $this->putJson("/api/s/{$bill->public_id}/claims", ['item_ids' => []])->assertUnauthorized();
        $this->putJson("/api/s/{$bill->public_id}/claims", ['item_ids' => []], ['X-Participant-Token' => 'forged'])->assertUnauthorized();

        $token = $this->postJson("/api/s/{$bill->public_id}/join", ['nickname' => 'Ali'])->json('token');
        $this->putJson("/api/s/{$bill->public_id}/claims", ['item_ids' => [$other->items[0]->id]], ['X-Participant-Token' => $token])
            ->assertOk()->assertJsonPath('bill.me.subtotal', 0);

        // A token for one bill is useless on another.
        $this->putJson("/api/s/{$other->public_id}/claims", ['item_ids' => []], ['X-Participant-Token' => $token])->assertUnauthorized();
    }

    public function test_bank_details_only_go_to_people_who_joined(): void
    {
        $bill = $this->openBill($this->host());

        $this->getJson("/api/s/{$bill->public_id}")
            ->assertJsonPath('bill.payment_options.bank', null)
            ->assertJsonPath('bill.payment_options.bank_available', true);

        $token = $this->postJson("/api/s/{$bill->public_id}/join", ['nickname' => 'Ali'])->json('token');
        $this->getJson("/api/s/{$bill->public_id}", ['X-Participant-Token' => $token])
            ->assertJsonPath('bill.payment_options.bank.account_number', 'PK36MEZN0001234567890');
    }

    public function test_bank_transfer_flow_notifies_host_and_locks_claims(): void
    {
        $host = $this->host();
        $bill = $this->openBill($host);
        $token = $this->postJson("/api/s/{$bill->public_id}/join", ['nickname' => 'Ali'])->json('token');
        $h = ['X-Participant-Token' => $token];

        $this->postJson("/api/s/{$bill->public_id}/pay/bank", [], $h)->assertStatus(422);

        $this->putJson("/api/s/{$bill->public_id}/claims", ['item_ids' => [$bill->items[0]->id]], $h);
        $this->postJson("/api/s/{$bill->public_id}/pay/bank", ['reference' => 'TXN-991'], $h)
            ->assertOk()->assertJsonPath('bill.me.payment_status', 'awaiting_confirmation');

        $this->putJson("/api/s/{$bill->public_id}/claims", ['item_ids' => []], $h)->assertStatus(409);

        Sanctum::actingAs($host);
        $this->getJson('/api/notifications')->assertJsonPath('unread', 1)->assertJsonPath('notifications.0.kind', 'bank_reported');

        $pid = $bill->participants()->first()->id;
        $this->postJson("/api/bills/{$bill->id}/participants/$pid/mark-paid", ['method' => 'bank'])
            ->assertJsonPath('bill.ledger.paid_count', 1)
            ->assertJsonPath('bill.ledger.paid_total', 7200)
            ->assertJsonPath('bill.participants.0.transaction_reference', 'TXN-991');
    }

    public function test_closed_bills_reject_new_people(): void
    {
        $host = $this->host();
        $bill = $this->openBill($host);
        $this->postJson("/api/bills/{$bill->id}/settle")->assertOk();

        $this->postJson("/api/s/{$bill->public_id}/join", ['nickname' => 'Late'])->assertStatus(409);
        $this->getJson("/api/s/{$bill->public_id}")->assertOk()->assertJsonPath('bill.status', 'settled');
    }

    public function test_discount_cannot_exceed_the_bill(): void
    {
        $host = $this->host();
        $bill = $this->openBill($host);

        $this->putJson("/api/bills/{$bill->id}", [
            'title' => 'x', 'currency' => 'PKR', 'tax' => 0, 'service_charge' => 0, 'tip' => 0, 'discount' => 5000,
            'items' => [['name' => 'Tea', 'price' => 1000]],
        ])->assertStatus(422)->assertJsonValidationErrors('discount');
    }

    public function test_editing_keeps_claims_on_items_that_stay(): void
    {
        $host = $this->host();
        $bill = $this->openBill($host);
        $token = $this->postJson("/api/s/{$bill->public_id}/join", ['nickname' => 'Ali'])->json('token');
        $karahi = $bill->items[0];
        $this->putJson("/api/s/{$bill->public_id}/claims", ['item_ids' => [$karahi->id]], ['X-Participant-Token' => $token]);

        Sanctum::actingAs($host);
        $this->putJson("/api/bills/{$bill->id}", [
            'title' => 'Kolachi', 'currency' => 'PKR', 'tax' => 0, 'service_charge' => 0, 'tip' => 0, 'discount' => 0,
            'items' => [['id' => $karahi->id, 'name' => 'Chicken karahi', 'price' => 6500]],
        ])->assertOk()
            ->assertJsonPath('bill.items.0.claimed_by.0', $bill->participants()->first()->id)
            ->assertJsonPath('bill.participants.0.total', 6500);
    }
}
