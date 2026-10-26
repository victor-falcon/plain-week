<?php

namespace App\Integrations\GoogleCalendar;

use Carbon\CarbonImmutable;

/**
 * What Google's token endpoint answers. A refresh carries no new refresh
 * token (usually) and no identity.
 */
final readonly class GoogleTokens
{
    /**
     * @param  list<string>  $scopes
     */
    public function __construct(
        public string $accessToken,
        public ?string $refreshToken,
        public CarbonImmutable $expiresAt,
        public array $scopes,
        public ?string $email,
    ) {}

    public function grants(string $scope): bool
    {
        return in_array($scope, $this->scopes, true);
    }
}
