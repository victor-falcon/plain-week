<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\StoreTokenRequest;
use App\Models\ApiToken;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Laravel\Fortify\Contracts\TwoFactorAuthenticationProvider;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * Issues and revokes the bearer tokens of the native apps (routes/api.php). The
 * plain token is returned exactly once; only its hash is stored.
 */
class TokenController extends Controller
{
    /**
     * The most tokens one account may hold (roughly one per device); the oldest is dropped.
     */
    private const int MAX_TOKENS = 25;

    /**
     * Issue a token for one device: email and password, plus the 2FA code when the
     * account has confirmed two-factor authentication.
     */
    public function store(StoreTokenRequest $request): JsonResponse
    {
        // Fortify lowercases the username on login; do the same here.
        $email = Str::lower($request->string('email')->value());
        $password = $request->string('password')->value();

        if (! Auth::validate(['email' => $email, 'password' => $password])) {
            throw ValidationException::withMessages(['email' => [__('auth.failed')]]);
        }

        /** @var User $user */
        $user = User::query()->where('email', $email)->firstOrFail();

        if ($user->two_factor_confirmed_at !== null) {
            $code = $request->string('code')->value();

            // A stored secret that is not a valid key (corrupted row) must not 500 the request.
            $valid = false;

            if ($code !== '') {
                try {
                    $valid = app(TwoFactorAuthenticationProvider::class)
                        ->verify(decrypt($user->two_factor_secret ?? ''), $code);
                } catch (Throwable) {
                    $valid = false;
                }
            }

            if (! $valid) {
                throw ValidationException::withMessages(['code' => [__('The provided two factor authentication code was invalid.')]]);
            }
        }

        if ($user->apiTokens()->count() >= self::MAX_TOKENS) {
            $user->apiTokens()->oldest('created_at')->first()?->delete();
        }

        $plain = Str::random(64);
        $name = $request->string('name')->value();

        $token = $user->apiTokens()->create([
            'name' => $name === '' ? 'device' : mb_substr($name, 0, 100),
            'token_hash' => ApiToken::hash($plain),
            'last_used_at' => now(),
        ]);

        return response()->json(['token' => $plain, 'name' => $token->name], 201);
    }

    /**
     * Revoke the token of the calling device (its logout).
     */
    public function destroy(Request $request): Response
    {
        $apiToken = $request->attributes->get('api_token');

        if ($apiToken instanceof ApiToken) {
            $apiToken->delete();
        }

        return response()->noContent();
    }
}
