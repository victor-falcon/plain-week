<?php

namespace App\Push;

/**
 * The JSON payload the service worker receives (`resources/js/sw.ts`). A message with the same `tag` replaces the
 * previous one on the device instead of stacking.
 */
final readonly class PushMessage
{
    public function __construct(
        public string $title,
        public string $body,
        public string $url,
        public string $tag,
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
