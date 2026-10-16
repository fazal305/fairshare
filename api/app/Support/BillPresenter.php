<?php

namespace App\Support;

use App\Models\Bill;
use App\Models\Participant;

/**
 * Builds the JSON views of a bill. The host sees the full ledger; a guest sees
 * the items, who ticked what, and only their own amounts.
 */
class BillPresenter
{
    public static function split(Bill $bill): array
    {
        $bill->loadMissing(['items.claimants:id', 'participants']);

        $items = [];
        $claims = [];
        foreach ($bill->items as $item) {
            $items[$item->id] = $item->price;
            $claims[$item->id] = $item->claimants->pluck('id')->all();
        }

        return SplitCalculator::split(
            $items,
            $claims,
            $bill->participants->pluck('id')->all(),
            $bill->tax + $bill->service_charge + $bill->tip - $bill->discount,
        );
    }

    public static function forHost(Bill $bill): array
    {
        $split = self::split($bill);
        $claimsByParticipant = self::claimsByParticipant($bill);

        $participants = $bill->participants->map(function (Participant $p) use ($split, $claimsByParticipant) {
            $share = $split['participants'][$p->id];

            return [
                'id' => $p->id,
                'nickname' => $p->nickname,
                'payment_status' => $p->payment_status,
                'payment_method' => $p->payment_method,
                'amount_paid' => $p->amount_paid,
                'transaction_reference' => $p->transaction_reference,
                'paid_at' => $p->paid_at?->toIso8601String(),
                'joined_at' => $p->created_at?->toIso8601String(),
                'items' => $claimsByParticipant[$p->id] ?? [],
            ] + $share;
        })->values();

        $paid = $participants->where('payment_status', Participant::COMPLETED);

        return self::base($bill, $split) + [
            'id' => $bill->id,
            'ocr_status' => $bill->ocr_status,
            'ocr_error' => $bill->ocr_error,
            'has_receipt' => (bool) $bill->receipt_path,
            'printed_subtotal' => $bill->printed_subtotal,
            'tax' => $bill->tax,
            'service_charge' => $bill->service_charge,
            'tip' => $bill->tip,
            'discount' => $bill->discount,
            'published_at' => $bill->published_at?->toIso8601String(),
            'created_at' => $bill->created_at?->toIso8601String(),
            'participants' => $participants,
            'ledger' => [
                'paid_count' => $paid->count(),
                'paid_total' => (int) $paid->sum('amount_paid'),
                'pending_count' => $participants->count() - $paid->count(),
                'pending_total' => (int) $participants->where('payment_status', '!=', Participant::COMPLETED)->sum('total'),
                'unclaimed_total' => $split['unclaimed_total'],
                'unclaimed_items' => $split['unclaimed_items'],
            ],
        ];
    }

    public static function forGuest(Bill $bill, ?Participant $me, bool $cardEnabled): array
    {
        $split = self::split($bill);
        $bank = $bill->host->bank_details;
        $hasBank = is_array($bank) && ! empty($bank['account_number']);

        return self::base($bill, $split) + [
            'host_name' => $bill->host->name,
            'participants' => $bill->participants->map(fn (Participant $p) => [
                'id' => $p->id,
                'nickname' => $p->nickname,
                'paid' => $p->isPaid(),
            ])->values(),
            'me' => $me ? [
                'id' => $me->id,
                'nickname' => $me->nickname,
                'payment_status' => $me->payment_status,
                'payment_method' => $me->payment_method,
                'amount_paid' => $me->amount_paid,
            ] + $split['participants'][$me->id] : null,
            'payment_options' => [
                'card' => $cardEnabled,
                // Account details only go to people who have joined the bill.
                'bank' => $me && $hasBank ? [
                    'account_title' => $bank['account_title'] ?? '',
                    'bank_name' => $bank['bank_name'] ?? '',
                    'account_number' => $bank['account_number'],
                ] : null,
                'bank_available' => $hasBank,
            ],
        ];
    }

    private static function base(Bill $bill, array $split): array
    {
        return [
            'public_id' => $bill->public_id,
            'title' => $bill->title,
            'currency' => $bill->currency,
            'status' => $bill->status,
            'items' => $bill->items->map(fn ($item) => [
                'id' => $item->id,
                'name' => $item->name,
                'price' => $item->price,
                'claimed_by' => $item->claimants->pluck('id')->values(),
            ])->values(),
            'summary' => [
                'items_subtotal' => $split['items_subtotal'],
                'tax' => $bill->tax,
                'service_charge' => $bill->service_charge,
                'tip' => $bill->tip,
                'discount' => $bill->discount,
                'adjustment' => $split['adjustment'],
                'grand_total' => $split['grand_total'],
            ],
            'updated_at' => $bill->updated_at?->toIso8601String(),
        ];
    }

    /** @return array<int, int[]> */
    private static function claimsByParticipant(Bill $bill): array
    {
        $map = [];
        foreach ($bill->items as $item) {
            foreach ($item->claimants as $p) {
                $map[$p->id][] = $item->id;
            }
        }

        return $map;
    }
}
