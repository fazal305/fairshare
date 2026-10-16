<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Bill;
use App\Models\Participant;
use App\Notifications\BillActivity;
use App\Services\StripeGateway;
use App\Support\BillPresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/** Guest side of a shared bill: no account, just a nickname and a token. */
class SessionController extends Controller
{
    private const MAX_PARTICIPANTS = 40;

    public function __construct(private readonly StripeGateway $stripe) {}

    public function show(Request $request, string $publicId): JsonResponse
    {
        $bill = $this->findShared($publicId);

        return $this->view($bill, $this->participant($request, $bill, required: false));
    }

    public function join(Request $request, string $publicId): JsonResponse
    {
        $bill = $this->findShared($publicId);
        $this->ensureOpen($bill);

        $data = $request->validate([
            'nickname' => ['required', 'string', 'max:40'],
        ], ['nickname.required' => 'Enter a name so the host knows who you are.']);
        $nickname = trim(preg_replace('/\s+/u', ' ', strip_tags($data['nickname'])));
        if ($nickname === '') {
            throw ValidationException::withMessages(['nickname' => 'Enter a name so the host knows who you are.']);
        }

        $token = Str::random(48);
        $participant = DB::transaction(function () use ($bill, $nickname, $token) {
            $taken = $bill->participants()->lockForUpdate()->get(['id', 'nickname']);
            if ($taken->count() >= self::MAX_PARTICIPANTS) {
                throw ValidationException::withMessages(['nickname' => 'This bill already has the maximum number of people.']);
            }
            if ($taken->contains(fn ($p) => mb_strtolower($p->nickname) === mb_strtolower($nickname))) {
                throw ValidationException::withMessages(['nickname' => "Someone called \"{$nickname}\" has already joined. Add an initial to tell you apart."]);
            }

            $participant = $bill->participants()->create([
                'nickname' => $nickname,
                'token_hash' => Participant::hashToken($token),
            ]);
            $bill->touch();

            return $participant;
        });

        return $this->view($bill->fresh(), $participant, ['token' => $token], 201);
    }

    public function claims(Request $request, string $publicId): JsonResponse
    {
        $bill = $this->findShared($publicId);
        $this->ensureOpen($bill);
        $me = $this->participant($request, $bill);

        if ($me->payment_status !== Participant::PENDING) {
            abort(409, 'You\'ve already paid, so your items are locked. Ask the host if something is wrong.');
        }

        $data = $request->validate([
            'item_ids' => ['present', 'array', 'max:100'],
            'item_ids.*' => ['integer'],
        ]);
        $valid = $bill->items()->whereIn('id', $data['item_ids'])->pluck('id')->all();

        $me->items()->sync($valid);
        $bill->touch();

        return $this->view($bill->fresh(), $me->fresh());
    }

    public function payCard(Request $request, string $publicId): JsonResponse
    {
        $bill = $this->findShared($publicId);
        $this->ensureOpen($bill);
        $me = $this->participant($request, $bill);

        if (! $this->stripe->enabled()) {
            abort(409, 'Card payments aren\'t available for this bill. Use bank transfer or pay the host directly.');
        }
        if ($me->payment_status !== Participant::PENDING) {
            abort(409, 'Your payment is already recorded.');
        }

        $amount = BillPresenter::split($bill)['participants'][$me->id]['total'];
        if ($amount <= 0) {
            throw ValidationException::withMessages(['amount' => 'Tick the items you had before paying.']);
        }

        $url = $this->stripe->createCheckout($bill, $me, $amount);
        if (! $url) {
            abort(502, 'The card payment page couldn\'t be opened. Try again, or pay by bank transfer.');
        }

        return response()->json(['url' => $url]);
    }

    public function payBank(Request $request, string $publicId): JsonResponse
    {
        $bill = $this->findShared($publicId);
        $this->ensureOpen($bill);
        $me = $this->participant($request, $bill);

        $data = $request->validate(['reference' => ['nullable', 'string', 'max:120']]);
        if (! is_array($bill->host->bank_details)) {
            abort(409, 'The host hasn\'t added bank details. Pay them directly instead.');
        }
        if ($me->payment_status !== Participant::PENDING) {
            abort(409, 'Your payment is already recorded.');
        }

        $amount = BillPresenter::split($bill)['participants'][$me->id]['total'];
        if ($amount <= 0) {
            throw ValidationException::withMessages(['reference' => 'Tick the items you had before paying.']);
        }

        $me->update([
            'payment_status' => Participant::AWAITING,
            'payment_method' => 'bank',
            'amount_paid' => $amount,
            'transaction_reference' => trim((string) ($data['reference'] ?? '')) ?: null,
        ]);
        $bill->touch();
        $bill->host->notify(new BillActivity($bill, $me, BillActivity::BANK_REPORTED, $amount));

        return $this->view($bill->fresh(), $me->fresh());
    }

    private function view(Bill $bill, ?Participant $me, array $extra = [], int $status = 200): JsonResponse
    {
        return response()->json(
            ['bill' => BillPresenter::forGuest($bill, $me, $this->stripe->enabled())] + $extra,
            $status,
        );
    }

    private function findShared(string $publicId): Bill
    {
        $bill = Bill::with('host')->where('public_id', $publicId)->first();
        // Drafts aren't shared yet, so they look the same as a missing link.
        abort_if(! $bill || $bill->status === 'draft', 404, 'This bill link doesn\'t exist. Check it with the host.');

        return $bill;
    }

    private function ensureOpen(Bill $bill): void
    {
        abort_unless($bill->isOpen(), 409, 'The host has closed this bill.');
    }

    private function participant(Request $request, Bill $bill, bool $required = true): ?Participant
    {
        $token = (string) $request->header('X-Participant-Token', '');
        $participant = $token === '' ? null : $bill->participants()
            ->where('token_hash', Participant::hashToken($token))
            ->first();

        if (! $participant && $required) {
            abort(401, 'Join the bill with your name first.');
        }

        return $participant;
    }
}
