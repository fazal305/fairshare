<?php

namespace App\Jobs;

use App\Models\Bill;
use App\Services\Receipts\ReceiptReader;
use App\Services\Receipts\ReceiptReadFailed;
use App\Support\Currencies;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class ReadReceipt implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 60;

    public function __construct(public Bill $bill) {}

    public function handle(ReceiptReader $reader): void
    {
        $bill = $this->bill->fresh();
        if (! $bill || ! $bill->receipt_path || $bill->ocr_status !== 'processing') {
            return;
        }

        try {
            $data = $reader->read(Storage::disk('local')->get($bill->receipt_path));
        } catch (ReceiptReadFailed $e) {
            $bill->update(['ocr_status' => 'failed', 'ocr_error' => $e->userMessage]);

            return;
        } catch (\Throwable $e) {
            Log::error('Receipt job crashed', ['bill' => $bill->id, 'error' => $e->getMessage()]);
            $bill->update(['ocr_status' => 'failed', 'ocr_error' => 'Something went wrong reading the receipt. Add the items by hand.']);

            return;
        }

        $found = $data['items'] !== [];

        DB::transaction(function () use ($bill, $data, $found) {
            // Never overwrite items the host typed in while the scan was running.
            if ($bill->items()->doesntExist()) {
                foreach ($data['items'] as $i => $item) {
                    $bill->items()->create($item + ['position' => $i]);
                }
            }
            $bill->update([
                'printed_subtotal' => $data['subtotal'],
                'tax' => $data['tax'],
                'service_charge' => $data['service_charge'],
                'tip' => $data['tip'],
                'discount' => $data['discount'],
                'currency' => in_array($data['currency'], Currencies::CODES, true) ? $data['currency'] : $bill->currency,
                'ocr_status' => $found ? 'done' : 'failed',
                'ocr_error' => $found ? null : 'No items were found on that receipt. Add them by hand.',
            ]);
        });
    }

    public function failed(?\Throwable $e): void
    {
        $this->bill->fresh()?->update([
            'ocr_status' => 'failed',
            'ocr_error' => 'Reading the receipt took too long. Add the items by hand, or try again.',
        ]);
    }
}
