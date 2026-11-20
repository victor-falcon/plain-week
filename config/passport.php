<?php

use App\Http\Middleware\LeaveForOAuthClient;

return [

    /*
    |--------------------------------------------------------------------------
    | Passport Guard
    |--------------------------------------------------------------------------
    |
    | The session guard the OAuth consent page signs users in with.
    |
    */

    'guard' => 'web',

    /*
    | Added to every /oauth route. The consent page is reached through Inertia
    | after logging in, and Passport answers an app the user already approved
    | with a redirect to that app, which an Inertia visit cannot follow.
    */

    'middleware' => [LeaveForOAuthClient::class],

    /*
    |--------------------------------------------------------------------------
    | Encryption Keys
    |--------------------------------------------------------------------------
    |
    | Passport signs access tokens with an RSA key pair. By default the keys are
    | the files storage/oauth-private.key and storage/oauth-public.key (the
    | Docker image creates them in its storage volume); these variables, when
    | set, take precedence.
    |
    */

    'private_key' => env('PASSPORT_PRIVATE_KEY'),

    'public_key' => env('PASSPORT_PUBLIC_KEY'),

    'connection' => env('PASSPORT_CONNECTION'),

];
