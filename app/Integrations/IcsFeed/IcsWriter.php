<?php

namespace App\Integrations\IcsFeed;

use Carbon\CarbonInterface;

/**
 * A minimal iCalendar (RFC 5545) writer: content lines joined with CRLF, folded at 75 octets without splitting a UTF-8
 * character, and TEXT values escaped. It writes only what the feed needs.
 */
final class IcsWriter
{
    private const string CRLF = "\r\n";

    /** The longest a content line may be, in octets, not counting the CRLF (RFC 5545 §3.1). */
    private const int LINE_OCTETS = 75;

    /** @var list<string> */
    private array $lines = [];

    public function begin(string $component): self
    {
        return $this->raw('BEGIN', $component);
    }

    public function end(string $component): self
    {
        return $this->raw('END', $component);
    }

    /**
     * A TEXT property (escaped).
     */
    public function text(string $name, string $value): self
    {
        return $this->raw($name, self::escapeText($value));
    }

    /**
     * A DATE-TIME in UTC (`19970714T173000Z`).
     */
    public function utc(string $name, CarbonInterface $time): self
    {
        return $this->raw($name, $time->toImmutable()->utc()->format('Ymd\THis\Z'));
    }

    /**
     * A DATE (`;VALUE=DATE:19970714`) from 'YYYY-MM-DD'.
     */
    public function date(string $name, string $date): self
    {
        return $this->raw("{$name};VALUE=DATE", str_replace('-', '', $date));
    }

    /**
     * A property written as given: the caller makes sure the value needs no escaping (a URI, a keyword, a number).
     */
    public function raw(string $name, string $value): self
    {
        $this->lines[] = self::fold("{$name}:{$value}");

        return $this;
    }

    public function toString(): string
    {
        return implode(self::CRLF, $this->lines).self::CRLF;
    }

    /**
     * Escapes a TEXT value: backslash, semicolon, comma and line breaks (RFC 5545 §3.3.11). Other control characters
     * are not allowed in TEXT, so they are dropped (a tab is kept).
     */
    public static function escapeText(string $value): string
    {
        $value = (string) preg_replace('/\r\n?/', "\n", $value);
        $value = (string) preg_replace('/[\x00-\x08\x0B-\x1F\x7F]/', '', $value);

        return strtr($value, ['\\' => '\\\\', ';' => '\;', ',' => '\,', "\n" => '\n']);
    }

    /**
     * Splits a content line into lines of at most 75 octets; each continuation starts with a space.
     */
    public static function fold(string $line): string
    {
        if (strlen($line) <= self::LINE_OCTETS) {
            return $line;
        }

        $folded = [];
        $current = '';
        // The first line has 75 octets for content, the continuations 74 after their leading space.
        $room = self::LINE_OCTETS;

        foreach (mb_str_split($line, 1, 'UTF-8') as $character) {
            if (strlen($current) + strlen($character) > $room) {
                $folded[] = $current;
                $current = '';
                $room = self::LINE_OCTETS - 1;
            }

            $current .= $character;
        }

        $folded[] = $current;

        return implode(self::CRLF.' ', $folded);
    }
}
