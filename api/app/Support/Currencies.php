<?php

namespace App\Support;

class Currencies
{
    /** Two-decimal currencies that Stripe Checkout accepts. */
    public const CODES = ['PKR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'CAD', 'AUD', 'INR'];
}
