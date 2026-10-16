<?php

namespace App\Services\Receipts;

interface ReceiptReader
{
    /**
     * @return array{items: array<int, array{name:string, price:int}>, subtotal:?int,
     *               tax:int, service_charge:int, tip:int, discount:int, currency:?string}
     *
     * @throws ReceiptReadFailed
     */
    public function read(string $jpegBytes): array;
}
