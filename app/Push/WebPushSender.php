<?php

namespace App\Push;

use GuzzleHttp\Client;
use GuzzleHttp\Psr7\HttpFactory;
use Illuminate\Support\Facades\Log;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;

/**
 * {@see PushSender} on `minishlink/web-push`: payload encryption, VAPID signing, and one batched flush.
 */
final class WebPushSender implements PushSender
{
    /**
     * Time a push service may keep a message for an offline device. A morning or a reminder is worthless much later.
     */
    private const int TTL_SECONDS = 3600;

    public function send(array $deliveries): PushReport
    {
        if ($deliveries === []) {
            return new PushReport;
        }

        $factory = new HttpFactory;
        $webPush = new WebPush(
            auth: ['VAPID' => [
                'subject' => PushConfig::subject(),
                'publicKey' => PushConfig::publicKey(),
                'privateKey' => PushConfig::privateKey(),
            ]],
            defaultOptions: ['TTL' => self::TTL_SECONDS, 'urgency' => 'normal'],
            client: new Client(['connect_timeout' => 5, 'timeout' => 15]),
            requestFactory: $factory,
            streamFactory: $factory,
        );
        $webPush->setReuseVAPIDHeaders(true);

        foreach ($deliveries as $delivery) {
            $webPush->queueNotification(
                new Subscription(
                    endpoint: $delivery->subscription->endpoint,
                    publicKey: $delivery->subscription->p256dh,
                    authToken: $delivery->subscription->auth,
                    contentEncoding: $delivery->subscription->content_encoding,
                ),
                $delivery->message->toJson(),
                ['topic' => self::topic($delivery->message->tag)],
            );
        }

        $delivered = [];
        $expired = [];

        foreach ($webPush->flush() as $report) {
            $endpoint = $report->getEndpoint();

            if ($report->isSuccess()) {
                $delivered[$endpoint] = true;
            } elseif ($report->isSubscriptionExpired()) {
                $expired[$endpoint] = true;
            } else {
                Log::warning('Web Push delivery failed.', [
                    'host' => parse_url($endpoint, PHP_URL_HOST),
                    'status' => $report->getResponse()?->getStatusCode(),
                    'reason' => $report->getReason(),
                ]);
            }
        }

        return new PushReport(array_keys($delivered), array_keys($expired));
    }

    /**
     * The `Topic` header lets a push service replace a message still waiting for an offline device. It allows at most
     * 32 URL-safe base64 characters, so it is a digest of the tag.
     */
    private static function topic(string $tag): string
    {
        return substr(rtrim(strtr(base64_encode(hash('sha256', $tag, true)), '+/', '-_'), '='), 0, 32);
    }
}
