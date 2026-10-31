<?php

namespace App\Push;

/**
 * The JSON payload the service worker receives (`resources/js/sw.ts`). A message with the same `tag` replaces the
 * previous one on the device instead of stacking. `ttl` is not part of the payload: it is how many seconds a push
 * service may keep the message for an offline device.
 */
final readonly class PushMessage
{
    public function __construct(
        public string $title,
        public string $body,
        public string $url,
        public string $tag,
        public int $ttl,
    ) {}

    public function toJson(): string
    {
        return json_encode([
            'title' => $this->title,
            'body' => $this->body,
            'url' => $this->url,
            'tag' => $this->tag,
        ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }
}
