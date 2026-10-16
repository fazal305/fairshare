<?php

namespace App\Notifications;

use App\Models\Bill;
use App\Models\Participant;
use Illuminate\Notifications\Notification;

/** In-app notification for the host (FR-4.3). */
class BillActivity extends Notification
{
    public const CARD_PAID = 'card_paid';

    public const BANK_REPORTED = 'bank_reported';

    public function __construct(
        private readonly Bill $bill,
        private readonly Participant $participant,
        private readonly string $kind,
        private readonly int $amount,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        return [
            'kind' => $this->kind,
            'bill_id' => $this->bill->id,
            'bill_title' => $this->bill->title,
            'nickname' => $this->participant->nickname,
            'amount' => $this->amount,
            'currency' => $this->bill->currency,
        ];
    }
}
