<?php

namespace App\Providers;

use App\Services\Receipts\ManualReceiptReader;
use App\Services\Receipts\OpenRouterReceiptReader;
use App\Services\Receipts\ReceiptReader;
use App\Services\StripeGateway;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(ReceiptReader::class, function () {
            $config = config('services.receipts');
            if ($config['driver'] !== 'openrouter' || blank($config['api_key'])) {
                return new ManualReceiptReader;
            }

            return new OpenRouterReceiptReader(
                $config['api_key'],
                $config['base_url'],
                array_values(array_filter(array_map('trim', explode(',', $config['models'])))),
                $config['timeout'],
            );
        });

        $this->app->singleton(StripeGateway::class, fn () => new StripeGateway(
            config('services.stripe.secret'),
            config('services.stripe.webhook_secret'),
            config('services.frontend_url'),
        ));
    }

    public function boot(): void
    {
        $byIp = fn (Request $r) => $r->ip();
        $guest = fn (Request $r) => $r->route('publicId').'|'.$r->ip();

        RateLimiter::for('auth', fn (Request $r) => [
            Limit::perMinute(10)->by($r->ip()),
            Limit::perMinute(5)->by('email|'.strtolower((string) $r->input('email'))),
        ]);
        RateLimiter::for('host', fn (Request $r) => Limit::perMinute(120)->by($r->user()?->id ?: $r->ip()));
        RateLimiter::for('upload', fn (Request $r) => Limit::perMinute(8)->by($r->user()?->id ?: $r->ip()));
        RateLimiter::for('guest-read', fn (Request $r) => Limit::perMinute(90)->by($guest($r)));
        RateLimiter::for('guest-join', fn (Request $r) => Limit::perMinute(6)->by($byIp($r)));
        RateLimiter::for('guest-write', fn (Request $r) => Limit::perMinute(40)->by($guest($r)));
        RateLimiter::for('webhook', fn (Request $r) => Limit::perMinute(300)->by($byIp($r)));
    }
}
