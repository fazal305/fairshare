<?php

namespace App\Services\Receipts;

class ManualReceiptReader implements ReceiptReader
{
    public function read(string $jpegBytes): array
    {
        throw new ReceiptReadFailed('Automatic reading isn\'t set up on this server. Add the items by hand.');
    }
}
