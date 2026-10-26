<?php

namespace App\Push;

/**
 * Web Push exists only when the instance has a VAPID key pair and subject
 * (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`); elsewhere its
 * routes are 404, the pages hide it and nothing is sent.
 */
final class PushConfig
{
    public static function enabled(): bool
    {
        return self::publicKey() !== null && self::privateKey() !== null && self::subject() !== null;
    }

    /**
     * The application server key the browser subscribes with (base64url).
     */
    public static function publicKey(): ?string
    {
        return self::value('public_key');
    }

    public static function privateKey(): ?string
    {
        return self::value('private_key');
    }

    /**
     * A `mailto:` or `https:` URL push services can use to reach the operator.
     */
    public static function subject(): ?string
    {
        return self::value('subject');
    }

    private static function value(string $key): ?string
    {
        $value = config("services.webpush.{$key}");

        return is_string($value) && $value !== '' ? $value : null;
    }
}
