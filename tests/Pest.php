<?php

use App\Actions\Sync\SyncFormat;
use App\Agents\AgentAccess;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Laravel\Socialite\Facades\Socialite;
use Tests\Support\FakeStripe;
use Tests\TestCase;

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| The closure you provide to your test functions is always bound to a specific PHPUnit test
| case class. By default, that class is "PHPUnit\Framework\TestCase". Of course, you may
| need to change it using the "pest()" function to bind different classes or traits.
|
*/

pest()->extend(TestCase::class)
 // ->use(RefreshDatabase::class)
    ->in('Feature');

/*
|--------------------------------------------------------------------------
| Expectations
|--------------------------------------------------------------------------
|
| When you're writing tests, you often need to check that values meet certain conditions. The
| "expect()" function gives you access to a set of "expectations" methods that you can use
| to assert different things. Of course, you may extend the Expectation API at any time.
|
*/

expect()->extend('toBeOne', function () {
    return $this->toBe(1);
});

/*
|--------------------------------------------------------------------------
| Functions
|--------------------------------------------------------------------------
|
| While Pest is very powerful out-of-the-box, you may have some testing code specific to your
| project that you don't want to repeat in every file. Here you can also expose helpers as
| global functions to help you to reduce the number of lines of code in your test files.
|
*/

function something()
{
    // ..
}

/**
 * Build a full wire record.
 *
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function wireTask(array $overrides = []): array
{
    return array_merge([
        'id' => (string) Str::uuid7(),
        'text' => 'Buy milk',
        'date' => '2026-10-15',
        'someday_column' => null,
        'position' => 'a0',
        'done' => false,
        'done_at' => null,
        'color' => 'none',
        'time' => null,
        'notes' => '',
        'subtasks' => [],
        'recurrence' => null,
        'series_id' => null,
        'occurrence_date' => null,
        'created_at' => '2026-10-15T08:35:00.123Z',
        'updated_at' => '2026-10-15T08:35:00.123Z',
        'deleted_at' => null,
    ], $overrides);
}

/**
 * Pushes like the current client; a null format sends no `X-Sync-Format` header, like v0.0.3 and older.
 *
 * @param  list<array<string, mixed>>  $tasks
 */
function push(array $tasks, ?SyncFormat $format = SyncFormat::DailyRules): TestResponse
{
    $headers = $format === null ? [] : [SyncFormat::HEADER => (string) $format->value];

    return test()->postJson(route('sync.push'), ['tasks' => $tasks], $headers);
}

/**
 * SaaS mode on, with a fake Stripe that knows the two prices and the launch coupon.
 */
function enableSaas(): FakeStripe
{
    config([
        'saas.enabled' => true,
        'saas.launch_coupon' => 'LAUNCH75',
        'cashier.secret' => 'sk_test_fake',
        'cashier.webhook.secret' => 'whsec_test',
    ]);

    $prices = [
        'plainweek_weekly' => ['id' => 'price_weekly', 'object' => 'price', 'unit_amount' => 299, 'currency' => 'eur', 'lookup_key' => 'plainweek_weekly', 'product' => 'prod_weekly'],
        'plainweek_lifetime' => ['id' => 'price_lifetime', 'object' => 'price', 'unit_amount' => 6400, 'currency' => 'eur', 'lookup_key' => 'plainweek_lifetime', 'product' => 'prod_lifetime'],
    ];

    return FakeStripe::install()
        ->on('get', '/v1/prices', fn (array $params) => [
            'object' => 'list',
            'url' => '/v1/prices',
            'has_more' => false,
            'data' => array_values(array_intersect_key($prices, array_flip($params['lookup_keys']))),
        ])
        ->on('get', '/v1/coupons/LAUNCH75', ['id' => 'LAUNCH75', 'object' => 'coupon', 'percent_off' => 75, 'valid' => true])
        ->on('post', '/v1/customers', ['id' => 'cus_test', 'object' => 'customer'])
        ->on('get', '/v1/customers/cus_test', ['id' => 'cus_test', 'object' => 'customer'])
        ->on('post', '/v1/checkout/sessions', ['id' => 'cs_test', 'object' => 'checkout.session', 'url' => 'https://checkout.stripe.com/c/pay/cs_test']);
}

/**
 * A Stripe subscription as the API returns it.
 *
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function stripeSubscription(array $overrides = []): array
{
    return array_merge([
        'id' => 'sub_test',
        'object' => 'subscription',
        'customer' => 'cus_test',
        'status' => 'active',
        'cancel_at_period_end' => false,
        'metadata' => ['type' => 'default'],
        'items' => [
            'object' => 'list',
            'data' => [[
                'id' => 'si_test',
                'object' => 'subscription_item',
                'quantity' => 1,
                'current_period_end' => now()->addWeek()->timestamp,
                'price' => ['id' => 'price_weekly', 'object' => 'price', 'product' => 'prod_weekly'],
            ]],
        ],
    ], $overrides);
}

/**
 * Posts a Stripe event to the webhook, signed with the test secret.
 *
 * @param  array<string, mixed>  $object
 */
function webhook(string $type, array $object): TestResponse
{
    $payload = json_encode(['id' => 'evt_test', 'type' => $type, 'data' => ['object' => $object]], JSON_THROW_ON_ERROR);
    $timestamp = time();
    $signature = hash_hmac('sha256', "{$timestamp}.{$payload}", 'whsec_test');

    return test()->call('POST', '/stripe/webhook', server: [
        'CONTENT_TYPE' => 'application/json',
        'HTTP_STRIPE_SIGNATURE' => "t={$timestamp},v1={$signature}",
    ], content: $payload);
}

/**
 * A completed, paid lifetime Checkout session for `cus_test`.
 *
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function lifetimeSession(array $overrides = []): array
{
    return [
        'id' => 'cs_test', 'object' => 'checkout.session', 'customer' => 'cus_test', 'mode' => 'payment',
        'status' => 'complete', 'payment_status' => 'paid', 'payment_intent' => 'pi_test',
        'metadata' => ['plan' => 'lifetime'], ...$overrides,
    ];
}

/**
 * A user with an active weekly subscription stored locally.
 */
function weeklySubscriber(string $status = 'active', ?DateTimeInterface $endsAt = null): User
{
    $user = User::factory()->create(['stripe_id' => 'cus_test']);

    $user->subscriptions()->create([
        'type' => 'default',
        'stripe_id' => 'sub_test',
        'stripe_status' => $status,
        'stripe_price' => 'price_weekly',
        'quantity' => 1,
        'ends_at' => $endsAt,
    ])->items()->create([
        'stripe_id' => 'si_test',
        'stripe_product' => 'prod_weekly',
        'stripe_price' => 'price_weekly',
        'quantity' => 1,
    ]);

    return $user;
}

/**
 * An RSA key pair for Passport (signing OAuth and personal access tokens), made once per test run so tests never
 * depend on storage/oauth-*.key.
 */
function usePassportKeys(): void
{
    static $keys = null;

    if ($keys === null) {
        $key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        openssl_pkey_export($key, $private);
        $keys = ['private' => $private, 'public' => openssl_pkey_get_details($key)['key']];
    }

    config(['passport.private_key' => $keys['private'], 'passport.public_key' => $keys['public']]);
}

/**
 * Sends one JSON-RPC request to the MCP server like a Streamable HTTP client after the 2025-06-18 handshake.
 *
 * @param  array<string, mixed>  $params
 */
function mcp(?string $token, string $method, array $params = []): TestResponse
{
    $headers = ['Accept' => 'application/json, text/event-stream', 'MCP-Protocol-Version' => '2025-06-18'];

    if ($token !== null) {
        $headers['Authorization'] = 'Bearer '.$token;
    }

    // Each call authenticates from its own headers, as a separate HTTP request would.
    app('auth')->forgetGuards();

    return test()->postJson('/mcp', ['jsonrpc' => '2.0', 'id' => 1, 'method' => $method, 'params' => $params], $headers);
}

/**
 * A personal access token for the MCP server.
 */
function personalToken(User $user, string $name = 'Claude Code'): string
{
    return app(AgentAccess::class)->createPersonalToken($user, $name);
}

/**
 * Calls one MCP tool and returns the response (`result.structuredContent` holds the tool's data, `result.isError`
 * tells a tool error).
 *
 * @param  array<string, mixed>  $arguments
 */
function callTool(string $token, string $name, array $arguments = []): TestResponse
{
    return mcp($token, 'tools/call', ['name' => $name, 'arguments' => (object) $arguments]);
}

/**
 * The text of a tool error (asserting it is one).
 *
 * @param  array<string, mixed>  $arguments
 */
function toolError(string $token, string $name, array $arguments = []): string
{
    $response = callTool($token, $name, $arguments)->assertOk()->assertJsonPath('result.isError', true);

    return (string) $response->json('result.content.0.text');
}

/**
 * The structured result of a tool call (asserting it succeeded).
 *
 * @param  array<string, mixed>  $arguments
 * @return array<string, mixed>
 */
function toolResult(string $token, string $name, array $arguments = []): array
{
    $response = callTool($token, $name, $arguments)->assertOk();

    expect($response->json('result.isError'))->toBeFalse($response->json('result.content.0.text') ?? '');

    return $response->json('result.structuredContent');
}

/**
 * Single sign-on configured with a test IdP (https://idp.test), optionally as the only way in.
 */
function useOidc(bool $only = false): void
{
    config([
        'oidc.enabled' => true,
        'oidc.issuer' => 'https://idp.test',
        'oidc.client_id' => 'plain-week',
        'oidc.client_secret' => 'client-secret',
        'oidc.label' => null,
        'oidc.only' => $only,
    ]);
}

/**
 * An identity the IdP vouched for, as the `oidc` Socialite driver returns it (claims in `getRaw()`).
 *
 * @param  array<string, mixed>  $claims
 */
function oidcIdentity(array $claims = []): Laravel\Socialite\Two\User
{
    $claims = [
        'sub' => 'idp-user-1',
        'email' => 'ada@example.com',
        'email_verified' => true,
        'name' => 'Ada Lovelace',
        ...$claims,
    ];

    return (new Laravel\Socialite\Two\User)->setRaw($claims)->map([
        'id' => $claims['sub'],
        'email' => $claims['email'],
        'name' => $claims['name'],
    ]);
}

/**
 * Comes back from the IdP as `$identity` (Socialite faked), for a login or, with `$confirm`, a re-authentication.
 */
function oidcCallback(Laravel\Socialite\Two\User $identity, bool $confirm = false): TestResponse
{
    Socialite::fake('oidc', $identity);

    return test()
        ->withSession(['oidc.intent' => $confirm ? 'confirm' : 'login'])
        ->get(route('oidc.callback', ['code' => 'code', 'state' => 'state']));
}
