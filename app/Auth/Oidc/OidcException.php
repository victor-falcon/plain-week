<?php

namespace App\Auth\Oidc;

use RuntimeException;

/**
 * The identity provider answered something we can't trust (bad discovery document, ID token or token response).
 */
final class OidcException extends RuntimeException {}
