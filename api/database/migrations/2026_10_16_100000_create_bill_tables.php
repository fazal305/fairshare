<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // All money columns are integer minor units (paisa / cents).
        Schema::create('bills', function (Blueprint $table) {
            $table->id();
            $table->foreignId('host_id')->constrained('users')->cascadeOnDelete();
            $table->string('public_id', 16)->unique();
            $table->string('title', 120);
            $table->char('currency', 3)->default('PKR');
            $table->unsignedBigInteger('printed_subtotal')->nullable();
            $table->unsignedBigInteger('tax')->default(0);
            $table->unsignedBigInteger('service_charge')->default(0);
            $table->unsignedBigInteger('tip')->default(0);
            $table->unsignedBigInteger('discount')->default(0);
            $table->string('status', 16)->default('draft');
            $table->string('ocr_status', 16)->default('none');
            $table->string('ocr_error')->nullable();
            $table->string('receipt_path')->nullable();
            $table->timestamp('published_at')->nullable();
            $table->timestamps();

            $table->index(['host_id', 'created_at']);
        });

        Schema::create('items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bill_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->unsignedBigInteger('price');
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();
        });

        Schema::create('bill_participants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bill_id')->constrained()->cascadeOnDelete();
            $table->string('nickname', 40);
            $table->char('token_hash', 64)->unique();
            $table->string('payment_status', 24)->default('pending');
            $table->string('payment_method', 16)->nullable();
            $table->unsignedBigInteger('amount_paid')->nullable();
            $table->string('transaction_reference', 120)->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();

            $table->unique(['bill_id', 'nickname']);
        });

        Schema::create('item_claims', function (Blueprint $table) {
            $table->id();
            $table->foreignId('item_id')->constrained()->cascadeOnDelete();
            $table->foreignId('participant_id')->constrained('bill_participants')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['item_id', 'participant_id']);
            $table->index('participant_id');
        });

        Schema::create('payment_events', function (Blueprint $table) {
            $table->id();
            $table->string('provider', 16);
            $table->string('event_id', 120);
            $table->string('type', 80);
            $table->timestamps();

            $table->unique(['provider', 'event_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_events');
        Schema::dropIfExists('item_claims');
        Schema::dropIfExists('bill_participants');
        Schema::dropIfExists('items');
        Schema::dropIfExists('bills');
    }
};
