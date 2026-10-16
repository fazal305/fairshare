<?php

namespace App\Services\Receipts;

class ReceiptReadFailed extends \RuntimeException
{
    /** $userMessage is safe to show the host; $detail is for logs only. */
    public function __construct(public readonly string $userMessage, string $detail = '')
    {
        parent::__construct($detail ?: $userMessage);
    }
}
