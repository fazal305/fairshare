<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Item extends Model
{
    protected $fillable = ['name', 'price', 'position'];

    protected function casts(): array
    {
        return ['price' => 'integer', 'position' => 'integer'];
    }

    public function bill(): BelongsTo
    {
        return $this->belongsTo(Bill::class);
    }

    public function claimants(): BelongsToMany
    {
        return $this->belongsToMany(Participant::class, 'item_claims', 'item_id', 'participant_id')->withTimestamps();
    }
}
