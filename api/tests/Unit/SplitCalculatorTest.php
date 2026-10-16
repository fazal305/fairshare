<?php

namespace Tests\Unit;

use App\Support\SplitCalculator;
use PHPUnit\Framework\TestCase;

class SplitCalculatorTest extends TestCase
{
    public function test_follows_the_srs_formula_for_proportional_fees(): void
    {
        // Bill subtotal 100.00, tax + tip 20.00 → everyone pays subtotal × 1.2.
        $r = SplitCalculator::split([1 => 6000, 2 => 4000], [1 => [10], 2 => [11]], [10, 11], 2000);

        $this->assertSame(7200, $r['participants'][10]['total']);
        $this->assertSame(4800, $r['participants'][11]['total']);
        $this->assertSame(12000, $r['grand_total']);
        $this->assertSame(0, $r['unclaimed_total']);
    }

    public function test_shared_items_split_equally_and_add_up_exactly(): void
    {
        // 10.00 between three people cannot divide evenly.
        $r = SplitCalculator::split([1 => 1000], [1 => [1, 2, 3]], [1, 2, 3], 0);

        $this->assertSame([334, 333, 333], array_column($r['participants'], 'subtotal'));
        $this->assertSame(1000, $r['claimed_total']);
    }

    public function test_rounded_shares_always_sum_to_the_grand_total(): void
    {
        mt_srand(42);
        for ($run = 0; $run < 300; $run++) {
            $people = range(1, mt_rand(1, 7));
            $items = [];
            $claims = [];
            foreach (range(1, mt_rand(1, 12)) as $id) {
                $items[$id] = mt_rand(1, 500000);
                shuffle($people);
                $claims[$id] = array_slice($people, 0, mt_rand(1, count($people)));
            }
            sort($people);
            $adjustment = mt_rand(-5000, 90000);

            $r = SplitCalculator::split($items, $claims, $people, $adjustment);

            $this->assertSame($r['grand_total'], array_sum(array_column($r['participants'], 'total')), "run $run");
            $this->assertSame(0, $r['unclaimed_total']);
        }
    }

    public function test_unclaimed_items_stay_with_the_bill_not_the_participants(): void
    {
        $r = SplitCalculator::split([1 => 5000, 2 => 5000], [1 => [7]], [7, 8], 1000);

        $this->assertSame(5500, $r['participants'][7]['total']);
        $this->assertSame(0, $r['participants'][8]['total']);
        $this->assertSame([2], $r['unclaimed_items']);
        $this->assertSame(5500, $r['unclaimed_total']);
    }

    public function test_discounts_lower_totals_proportionally(): void
    {
        $r = SplitCalculator::split([1 => 3000, 2 => 1000], [1 => [1], 2 => [2]], [1, 2], -400);

        $this->assertSame(2700, $r['participants'][1]['total']);
        $this->assertSame(900, $r['participants'][2]['total']);
    }

    public function test_ignores_claims_from_unknown_participants(): void
    {
        $r = SplitCalculator::split([1 => 900], [1 => [1, 99]], [1], 0);

        $this->assertSame(900, $r['participants'][1]['subtotal']);
    }
}
