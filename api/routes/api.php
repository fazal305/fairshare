<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BillController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\SessionController;
use App\Http\Controllers\Api\StripeWebhookController;
use Illuminate\Support\Facades\Route;

Route::middleware('throttle:auth')->group(function () {
    Route::post('/auth/register', [AuthController::class, 'register']);
    Route::post('/auth/login', [AuthController::class, 'login']);
});

Route::middleware(['auth:sanctum', 'throttle:host'])->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::put('/me/bank-details', [AuthController::class, 'updateBankDetails']);
    Route::delete('/me', [AuthController::class, 'destroy']);

    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::post('/notifications/read', [NotificationController::class, 'markRead']);

    Route::get('/bills', [BillController::class, 'index']);
    Route::post('/bills', [BillController::class, 'store'])->middleware('throttle:upload');
    Route::get('/bills/{bill}', [BillController::class, 'show']);
    Route::put('/bills/{bill}', [BillController::class, 'update']);
    Route::delete('/bills/{bill}', [BillController::class, 'destroy']);
    Route::get('/bills/{bill}/receipt', [BillController::class, 'receipt']);
    Route::post('/bills/{bill}/rescan', [BillController::class, 'rescan'])->middleware('throttle:upload');
    Route::post('/bills/{bill}/publish', [BillController::class, 'publish']);
    Route::post('/bills/{bill}/settle', [BillController::class, 'settle']);
    Route::post('/bills/{bill}/reopen', [BillController::class, 'reopen']);
    Route::post('/bills/{bill}/participants/{participant}/mark-paid', [BillController::class, 'markPaid']);
    Route::post('/bills/{bill}/participants/{participant}/mark-unpaid', [BillController::class, 'markUnpaid']);
    Route::delete('/bills/{bill}/participants/{participant}', [BillController::class, 'removeParticipant']);
});

Route::prefix('/s/{publicId}')->where(['publicId' => '[A-Za-z0-9]{12}'])->group(function () {
    Route::get('/', [SessionController::class, 'show'])->middleware('throttle:guest-read');
    Route::post('/join', [SessionController::class, 'join'])->middleware('throttle:guest-join');
    Route::middleware('throttle:guest-write')->group(function () {
        Route::put('/claims', [SessionController::class, 'claims']);
        Route::post('/pay/card', [SessionController::class, 'payCard']);
        Route::post('/pay/bank', [SessionController::class, 'payBank']);
    });
});

Route::post('/webhooks/stripe', StripeWebhookController::class)->middleware('throttle:webhook');
