<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:60'],
            'email' => ['required', 'string', 'email:rfc', 'max:190', 'unique:users,email'],
            'password' => ['required', 'string', Password::min(8)],
            'accept_terms' => ['accepted'],
        ], [
            'email.unique' => 'An account with this email already exists. Try logging in.',
            'accept_terms.accepted' => 'Please accept the terms and privacy policy to continue.',
        ]);

        $user = User::create([
            'name' => trim($data['name']),
            'email' => strtolower($data['email']),
            'password' => $data['password'],
        ]);

        return response()->json([
            'token' => $user->createToken('web')->plainTextToken,
            'user' => $user->toApi(),
        ], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', strtolower($data['email']))->first();
        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['email' => 'That email and password don\'t match.']);
        }

        // Keep a handful of sessions per host; old devices drop off.
        $user->tokens()->latest('id')->skip(4)->take(PHP_INT_MAX)->get()->each->delete();

        return response()->json([
            'token' => $user->createToken('web', ['*'], now()->addDays(30))->plainTextToken,
            'user' => $user->toApi(),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['ok' => true]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $request->user()->toApi()]);
    }

    public function updateBankDetails(Request $request): JsonResponse
    {
        $data = $request->validate([
            'account_title' => ['nullable', 'string', 'max:80'],
            'bank_name' => ['nullable', 'string', 'max:80'],
            'account_number' => ['nullable', 'string', 'max:40', 'regex:/^[A-Za-z0-9 \-]+$/'],
        ], [
            'account_number.regex' => 'Use only letters, numbers, spaces and dashes (an IBAN or account number).',
        ]);

        $user = $request->user();
        $user->bank_details = filled($data['account_number'] ?? null) ? [
            'account_title' => trim((string) ($data['account_title'] ?? '')),
            'bank_name' => trim((string) ($data['bank_name'] ?? '')),
            'account_number' => strtoupper(trim($data['account_number'])),
        ] : null;
        $user->save();

        return response()->json(['user' => $user->toApi()]);
    }

    public function destroy(Request $request): JsonResponse
    {
        $request->validate(['password' => ['required', 'current_password:sanctum']]);

        $user = $request->user();
        foreach ($user->bills()->whereNotNull('receipt_path')->pluck('receipt_path') as $path) {
            Storage::disk(config('filesystems.receipt_disk'))->delete($path);
        }
        $user->tokens()->delete();
        $user->delete();

        return response()->json(['ok' => true]);
    }
}
