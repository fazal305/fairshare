<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\ReadReceipt;
use App\Models\Bill;
use App\Models\Participant;
use App\Services\Receipts\ReceiptImage;
use App\Support\BillPresenter;
use App\Support\Currencies;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class BillController extends Controller
{
    private const MAX_MONEY = 100_000_000; // 1,000,000.00 in minor units

    public function index(Request $request): JsonResponse
    {
        $bills = $request->user()->bills()
            ->withCount('participants')
            ->withCount(['participants as paid_count' => fn ($q) => $q->where('payment_status', Participant::COMPLETED)])
            ->latest()
            ->limit(100)
            ->get()
            ->map(fn (Bill $b) => [
                'id' => $b->id,
                'public_id' => $b->public_id,
                'title' => $b->title,
                'currency' => $b->currency,
                'status' => $b->status,
                'ocr_status' => $b->ocr_status,
                'participants_count' => $b->participants_count,
                'paid_count' => $b->paid_count,
                'created_at' => $b->created_at?->toIso8601String(),
            ]);

        return response()->json(['bills' => $bills]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['nullable', 'string', 'max:120'],
            'currency' => ['nullable', Rule::in(Currencies::CODES)],
            'receipt' => ['nullable', 'file', 'max:10240'],
        ], [
            'receipt.max' => 'That photo is over 10 MB. Try a smaller one.',
            'receipt.uploaded' => 'The photo didn\'t finish uploading. Check your connection and try again.',
        ]);

        $path = $request->hasFile('receipt') ? ReceiptImage::store($request->file('receipt')) : null;

        $bill = new Bill([
            'title' => trim((string) ($data['title'] ?? '')) ?: 'Dinner on '.now()->format('j M'),
            'currency' => $data['currency'] ?? 'PKR',
            'receipt_path' => $path,
            'ocr_status' => $path ? 'processing' : 'none',
        ]);
        $bill->host()->associate($request->user());
        $bill->save();

        if ($path) {
            ReadReceipt::dispatch($bill);
        }

        return response()->json(['bill' => BillPresenter::forHost($bill->fresh())], 201);
    }

    public function show(Request $request, Bill $bill): JsonResponse
    {
        $this->authorizeHost($request, $bill);

        return response()->json(['bill' => BillPresenter::forHost($bill)]);
    }

    public function update(Request $request, Bill $bill): JsonResponse
    {
        $this->authorizeHost($request, $bill);
        if ($bill->status === 'settled') {
            abort(409, 'This bill is closed. Reopen it to make changes.');
        }

        $money = ['required', 'integer', 'min:0', 'max:'.self::MAX_MONEY];
        $data = $request->validate([
            'title' => ['required', 'string', 'max:120'],
            'currency' => ['required', Rule::in(Currencies::CODES)],
            'tax' => $money,
            'service_charge' => $money,
            'tip' => $money,
            'discount' => $money,
            'items' => ['present', 'array', 'max:100'],
            'items.*.id' => ['nullable', 'integer'],
            'items.*.name' => ['required', 'string', 'max:120'],
            'items.*.price' => ['required', 'integer', 'min:1', 'max:'.self::MAX_MONEY],
        ], [
            'items.*.name.required' => 'Give this item a name.',
            'items.*.price.min' => 'Enter a price above zero.',
        ]);

        if ($bill->status !== 'draft' && $bill->currency !== $data['currency'] && $bill->participants()->where('payment_status', '!=', Participant::PENDING)->exists()) {
            throw ValidationException::withMessages(['currency' => 'Someone has already paid, so the currency can\'t change.']);
        }

        $subtotal = array_sum(array_column($data['items'], 'price'));
        if ($data['discount'] > $subtotal + $data['tax'] + $data['service_charge'] + $data['tip']) {
            throw ValidationException::withMessages(['discount' => 'The discount can\'t be more than the whole bill.']);
        }

        DB::transaction(function () use ($bill, $data) {
            $existing = $bill->items()->pluck('id')->all();
            $kept = [];
            foreach (array_values($data['items']) as $i => $row) {
                $attrs = ['name' => trim($row['name']), 'price' => $row['price'], 'position' => $i];
                $id = $row['id'] ?? null;
                if ($id && in_array($id, $existing, true)) {
                    $bill->items()->whereKey($id)->update($attrs);
                    $kept[] = $id;
                } else {
                    $kept[] = $bill->items()->create($attrs)->id;
                }
            }
            $bill->items()->whereNotIn('id', $kept)->delete();

            $bill->fill([
                'title' => trim($data['title']),
                'currency' => $data['currency'],
                'tax' => $data['tax'],
                'service_charge' => $data['service_charge'],
                'tip' => $data['tip'],
                'discount' => $data['discount'],
            ]);
            // Leaving the "reading" state once the host starts typing.
            if ($bill->ocr_status === 'processing') {
                $bill->ocr_status = 'failed';
                $bill->ocr_error = null;
            }
            $bill->touch();
            $bill->save();
        });

        return response()->json(['bill' => BillPresenter::forHost($bill->fresh())]);
    }

    public function rescan(Request $request, Bill $bill): JsonResponse
    {
        $this->authorizeHost($request, $bill);
        if (! $bill->receipt_path || $bill->status !== 'draft') {
            abort(409, 'Only draft bills with a receipt photo can be read again.');
        }
        if ($bill->items()->exists()) {
            abort(409, 'Clear the items first; reading again never overwrites your edits.');
        }

        $bill->update(['ocr_status' => 'processing', 'ocr_error' => null]);
        ReadReceipt::dispatch($bill);

        return response()->json(['bill' => BillPresenter::forHost($bill->fresh())]);
    }

    public function publish(Request $request, Bill $bill): JsonResponse
    {
        $this->authorizeHost($request, $bill);
        if ($bill->items()->doesntExist()) {
            throw ValidationException::withMessages(['items' => 'Add at least one item before sharing the bill.']);
        }

        $bill->update(['status' => 'open', 'published_at' => $bill->published_at ?? now(), 'ocr_status' => $bill->ocr_status === 'processing' ? 'failed' : $bill->ocr_status]);

        return response()->json(['bill' => BillPresenter::forHost($bill->fresh())]);
    }

    public function settle(Request $request, Bill $bill): JsonResponse
    {
        $this->authorizeHost($request, $bill);
        $bill->update(['status' => 'settled']);

        return response()->json(['bill' => BillPresenter::forHost($bill->fresh())]);
    }

    public function reopen(Request $request, Bill $bill): JsonResponse
    {
        $this->authorizeHost($request, $bill);
        $bill->update(['status' => $bill->published_at ? 'open' : 'draft']);

        return response()->json(['bill' => BillPresenter::forHost($bill->fresh())]);
    }

    public function destroy(Request $request, Bill $bill): JsonResponse
    {
        $this->authorizeHost($request, $bill);
        if ($bill->receipt_path) {
            Storage::disk('local')->delete($bill->receipt_path);
        }
        $bill->delete();

        return response()->json(['ok' => true]);
    }

    public function receipt(Request $request, Bill $bill): StreamedResponse
    {
        $this->authorizeHost($request, $bill);
        abort_unless($bill->receipt_path && Storage::disk('local')->exists($bill->receipt_path), 404);

        return Storage::disk('local')->response($bill->receipt_path, 'receipt.jpg', [
            'Content-Type' => 'image/jpeg',
            'Cache-Control' => 'private, max-age=600',
        ]);
    }

    public function markPaid(Request $request, Bill $bill, Participant $participant): JsonResponse
    {
        $this->authorizeHost($request, $bill);
        abort_unless($participant->bill_id === $bill->id, 404);
        $data = $request->validate(['method' => ['required', Rule::in(['bank', 'cash'])]]);

        if (! $participant->isPaid()) {
            $total = BillPresenter::split($bill)['participants'][$participant->id]['total'];
            $participant->update([
                'payment_status' => Participant::COMPLETED,
                'payment_method' => $participant->payment_method ?? $data['method'],
                'amount_paid' => $participant->payment_status === Participant::AWAITING ? $participant->amount_paid : $total,
                'paid_at' => now(),
            ]);
            $bill->touch();
        }

        return response()->json(['bill' => BillPresenter::forHost($bill->fresh())]);
    }

    public function markUnpaid(Request $request, Bill $bill, Participant $participant): JsonResponse
    {
        $this->authorizeHost($request, $bill);
        abort_unless($participant->bill_id === $bill->id, 404);
        if ($participant->payment_method === 'card' && $participant->isPaid()) {
            abort(409, 'Card payments are confirmed by Stripe. Refund it from the Stripe dashboard instead.');
        }

        $participant->update([
            'payment_status' => Participant::PENDING,
            'payment_method' => null,
            'amount_paid' => null,
            'transaction_reference' => null,
            'paid_at' => null,
        ]);
        $bill->touch();

        return response()->json(['bill' => BillPresenter::forHost($bill->fresh())]);
    }

    public function removeParticipant(Request $request, Bill $bill, Participant $participant): JsonResponse
    {
        $this->authorizeHost($request, $bill);
        abort_unless($participant->bill_id === $bill->id, 404);
        if ($participant->payment_status !== Participant::PENDING) {
            abort(409, 'This person has started paying, so they can\'t be removed.');
        }

        $participant->delete();
        $bill->touch();

        return response()->json(['bill' => BillPresenter::forHost($bill->fresh())]);
    }

    private function authorizeHost(Request $request, Bill $bill): void
    {
        // 404 rather than 403, so bill ids can't be probed.
        abort_unless($bill->host_id === $request->user()->id, 404);
    }
}
