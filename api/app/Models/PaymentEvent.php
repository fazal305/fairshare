<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PaymentEvent extends Model
{
    protected $fillable = ['provider', 'event_id', 'type'];
}
