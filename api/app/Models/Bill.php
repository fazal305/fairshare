<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Bill extends Model
{
    public const STATUSES = ['draft', 'open', 'settled'];

    protected $fillable = [
        'title', 'currency', 'printed_subtotal', 'tax', 'service_charge', 'tip', 'discount',
        'status', 'ocr_status', 'ocr_error', 'receipt_path', 'published_at',
    ];

    protected $hidden = ['receipt_path'];

    protected function casts(): array
    {
        return [
            'printed_subtotal' => 'integer',
            'tax' => 'integer',
            'service_charge' => 'integer',
            'tip' => 'integer',
            'discount' => 'integer',
            'published_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (Bill $bill) {
            // 12 chars of base62 ≈ 71 bits: unguessable share links.
            $bill->public_id ??= Str::random(12);
        });
    }

    public function host(): BelongsTo
    {
        return $this->belongsTo(User::class, 'host_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(Item::class)->orderBy('position')->orderBy('id');
    }

    public function participants(): HasMany
    {
        return $this->hasMany(Participant::class)->orderBy('id');
    }

    public function isOpen(): bool
    {
        return $this->status === 'open';
    }
}
