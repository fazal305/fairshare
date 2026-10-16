<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Participant extends Model
{
    public const PENDING = 'pending';

    public const AWAITING = 'awaiting_confirmation';

    public const COMPLETED = 'completed';

    protected $table = 'bill_participants';

    protected $fillable = [
        'nickname', 'token_hash', 'payment_status', 'payment_method',
        'amount_paid', 'transaction_reference', 'paid_at',
    ];

    protected $hidden = ['token_hash'];

    protected function casts(): array
    {
        return ['amount_paid' => 'integer', 'paid_at' => 'datetime'];
    }

    public function bill(): BelongsTo
    {
        return $this->belongsTo(Bill::class);
    }

    public function items(): BelongsToMany
    {
        return $this->belongsToMany(Item::class, 'item_claims', 'participant_id', 'item_id')->withTimestamps();
    }

    public function isPaid(): bool
    {
        return $this->payment_status === self::COMPLETED;
    }

    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }
}
