<?php

namespace App\Support;

/**
 * Splits a bill between participants (FR-2.4, FR-3.1).
 *
 * Works in integer minor units throughout. Shared items are split equally and
 * the fee/tax adjustment is allocated in proportion to each person's item
 * subtotal. Leftover paisa from rounding are handed out with the
 * largest-remainder method so the shares always add up to the exact amount.
 */
class SplitCalculator
{
    /**
     * @param  array<int, int>  $items  item id => price
     * @param  array<int, int[]>  $claims  item id => participant ids
     * @param  int[]  $participantIds  in a stable order (used to break ties)
     * @param  int  $adjustment  tax + service charge + tip - discount
     * @return array{
     *   items_subtotal:int, adjustment:int, grand_total:int,
     *   claimed_total:int, unclaimed_total:int, unclaimed_items:int[],
     *   participants: array<int, array{subtotal:int, adjustment:int, total:int}>
     * }
     */
    public static function split(array $items, array $claims, array $participantIds, int $adjustment): array
    {
        $subtotals = array_fill_keys($participantIds, 0);
        $unclaimed = [];
        $known = array_flip($participantIds);

        foreach ($items as $itemId => $price) {
            $claimants = array_values(array_filter(
                $claims[$itemId] ?? [],
                fn ($id) => isset($known[$id]),
            ));
            if ($claimants === []) {
                $unclaimed[] = $itemId;

                continue;
            }
            usort($claimants, fn ($a, $b) => $known[$a] <=> $known[$b]);
            foreach (self::divideEvenly($price, count($claimants)) as $i => $part) {
                $subtotals[$claimants[$i]] += $part;
            }
        }

        $itemsSubtotal = array_sum($items);
        $claimedSubtotal = array_sum($subtotals);
        $adjustments = self::allocateProportionally($subtotals, $adjustment, $itemsSubtotal, $claimedSubtotal);

        $participants = [];
        foreach ($subtotals as $id => $subtotal) {
            $participants[$id] = [
                'subtotal' => $subtotal,
                'adjustment' => $adjustments[$id],
                'total' => $subtotal + $adjustments[$id],
            ];
        }

        $grandTotal = $itemsSubtotal + $adjustment;
        $claimedTotal = array_sum(array_column($participants, 'total'));

        return [
            'items_subtotal' => $itemsSubtotal,
            'adjustment' => $adjustment,
            'grand_total' => $grandTotal,
            'claimed_total' => $claimedTotal,
            'unclaimed_total' => $grandTotal - $claimedTotal,
            'unclaimed_items' => $unclaimed,
            'participants' => $participants,
        ];
    }

    /** @return int[] parts that sum to $amount, larger parts first */
    public static function divideEvenly(int $amount, int $ways): array
    {
        $base = intdiv($amount, $ways);
        $extra = $amount - $base * $ways;

        return array_map(fn ($i) => $base + ($i < $extra ? 1 : 0), range(0, $ways - 1));
    }

    /**
     * Each participant gets subtotal × adjustment ÷ itemsSubtotal. The
     * claimed portion is rounded once as a whole, then shared out.
     *
     * @param  array<int, int>  $subtotals
     * @return array<int, int>
     */
    private static function allocateProportionally(array $subtotals, int $adjustment, int $itemsSubtotal, int $claimedSubtotal): array
    {
        $result = array_map(fn () => 0, $subtotals);
        if ($adjustment === 0 || $itemsSubtotal === 0 || $claimedSubtotal === 0) {
            return $result;
        }

        $sign = $adjustment < 0 ? -1 : 1;
        $abs = abs($adjustment);
        $target = intdiv($claimedSubtotal * $abs * 2 + $itemsSubtotal, $itemsSubtotal * 2);

        $remainders = [];
        foreach ($subtotals as $id => $subtotal) {
            $numerator = $subtotal * $abs;
            $result[$id] = intdiv($numerator, $itemsSubtotal);
            $remainders[$id] = $numerator % $itemsSubtotal;
        }

        $order = array_keys($subtotals);
        $position = array_flip($order);
        usort($order, fn ($a, $b) => [$remainders[$b], $position[$a]] <=> [$remainders[$a], $position[$b]]);

        $left = $target - array_sum($result);
        for ($i = 0; $left > 0 && $i < count($order); $i++, $left--) {
            $result[$order[$i]]++;
        }

        return array_map(fn ($v) => $v * $sign, $result);
    }
}
