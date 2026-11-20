<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use JsonException;

/**
 * The languages this instance offers and their translations.
 *
 * English is the only bundled language: the React app's catalog lives in resources/js/lang and the server's strings are
 * the English text passed to `__()`. Self-hosters add languages, or reword English, with one `<locale>.json` file per
 * language in `config('app.translations_path')` (TRANSLATIONS_PATH). Each file maps keys to text: the app's keys
 * (`"planner.today": "Heute"`, a plural as `{"one": "…", "other": "…"}`) and the server's English strings
 * (`"Profile updated.": "Profil gespeichert."`, `"validation.required": "…"`). See docs/self-hosting.md#translations.
 *
 * A file that is not a JSON object is ignored (and logged), so a typo never takes the instance down.
 */
final class Translations
{
    public const string BUNDLED = 'en';

    /** A file name (without `.json`) that may be a locale: `de`, `pt-BR`, `zh_Hant`. */
    private const string LOCALE_PATTERN = '/^[a-z]{2,3}([_-][A-Za-z0-9]{2,8})*$/';

    /** @var array<string, array<string, string|array<string, string>>> */
    private array $overrides = [];

    /** @var list<string>|null */
    private ?array $available = null;

    public function path(): string
    {
        return rtrim(config()->string('app.translations_path'), '/');
    }

    /**
     * Every locale this instance offers: English first, then the ones the translations directory adds.
     *
     * @return list<string>
     */
    public function available(): array
    {
        if ($this->available !== null) {
            return $this->available;
        }

        $locales = [self::BUNDLED];

        foreach (glob($this->path().'/*.json') ?: [] as $file) {
            $locale = basename($file, '.json');

            if ($locale !== self::BUNDLED && preg_match(self::LOCALE_PATTERN, $locale) === 1) {
                $locales[] = $locale;
            }
        }

        $bundled = array_shift($locales);
        sort($locales);

        return $this->available = [$bundled, ...$locales];
    }

    public function isAvailable(?string $locale): bool
    {
        return $locale !== null && in_array($locale, $this->available(), true);
    }

    /**
     * The locale for a request: the account's choice (Settings › Preferences) when the instance still offers it, else
     * the best match for the browser's languages, else APP_LOCALE when offered, else English.
     */
    public function resolve(Request $request, ?string $preferred = null): string
    {
        if ($this->isAvailable($preferred)) {
            return (string) $preferred;
        }

        return $this->match($request->getLanguages()) ?? $this->fallback();
    }

    /**
     * The first offered locale that matches one of the given languages (most preferred first). An exact match wins
     * (`pt-BR` ↔ `pt_BR`), then one with the same language (`de-AT` → `de`, `pt` → `pt-BR`).
     *
     * @param  array<string>  $languages
     */
    public function match(array $languages): ?string
    {
        $offered = [];

        foreach ($this->available() as $locale) {
            $offered[self::normalize($locale)] = $locale;
        }

        foreach ($languages as $language) {
            $wanted = self::normalize($language);

            if (isset($offered[$wanted])) {
                return $offered[$wanted];
            }

            $base = self::language($wanted);

            foreach ($offered as $normalized => $locale) {
                if (self::language($normalized) === $base) {
                    return $locale;
                }
            }
        }

        return null;
    }

    /**
     * APP_LOCALE when the instance offers it, else English.
     */
    public function fallback(): string
    {
        $default = config()->string('app.locale');

        return $this->isAvailable($default) ? $default : self::BUNDLED;
    }

    /**
     * The translations of one locale from its file, `[]` without one.
     *
     * @return array<string, string|array<string, string>>
     */
    public function overrides(string $locale): array
    {
        if (array_key_exists($locale, $this->overrides)) {
            return $this->overrides[$locale];
        }

        return $this->overrides[$locale] = $this->read($locale);
    }

    /**
     * What the React app needs on top of its bundled English catalog: the English overrides, then the locale's.
     *
     * @return array<string, string|array<string, string>>
     */
    public function messages(string $locale): array
    {
        $english = $this->overrides(self::BUNDLED);

        return $locale === self::BUNDLED ? $english : [...$english, ...$this->overrides($locale)];
    }

    /**
     * Whether a locale is written right to left (`config('app.rtl_locales')` lists languages: `ar` covers `ar-EG`).
     */
    public function isRtl(string $locale): bool
    {
        /** @var list<string> $rtl */
        $rtl = config()->array('app.rtl_locales');

        return in_array(self::language(self::normalize($locale)), $rtl, true);
    }

    /**
     * The BCP 47 tag of a locale, for `<html lang>` and `Intl` (`pt_BR` → `pt-BR`).
     */
    public static function tag(string $locale): string
    {
        return str_replace('_', '-', $locale);
    }

    /**
     * @return array<string, string|array<string, string>>
     */
    private function read(string $locale): array
    {
        if (preg_match(self::LOCALE_PATTERN, $locale) !== 1) {
            return [];
        }

        $file = $this->path()."/{$locale}.json";

        if (! is_file($file) || ! is_readable($file)) {
            return [];
        }

        try {
            $decoded = json_decode((string) file_get_contents($file), true, 4, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            Log::warning("Ignoring the translation file {$file}: {$exception->getMessage()}");

            return [];
        }

        if (! is_array($decoded) || (array_is_list($decoded) && $decoded !== [])) {
            Log::warning("Ignoring the translation file {$file}: it must be a JSON object of keys and texts.");

            return [];
        }

        $messages = [];
        $skipped = [];

        foreach ($decoded as $key => $value) {
            if (is_string($value)) {
                $messages[(string) $key] = $value;
            } elseif (self::isPlural($value)) {
                /** @var array<string, string> $value */
                $messages[(string) $key] = $value;
            } else {
                $skipped[] = (string) $key;
            }
        }

        if ($skipped !== []) {
            Log::warning("Ignoring entries of the translation file {$file} that are neither a text nor a plural with an \"other\" text: ".implode(', ', $skipped));
        }

        return $messages;
    }

    /**
     * A plural: `{"one": "…", "other": "…"}`, texts keyed by plural category, `other` required.
     */
    private static function isPlural(mixed $value): bool
    {
        return is_array($value)
            && isset($value['other'])
            && array_filter($value, is_string(...)) === $value
            && array_diff(array_keys($value), ['zero', 'one', 'two', 'few', 'many', 'other']) === [];
    }

    private static function normalize(string $locale): string
    {
        return strtolower(str_replace('_', '-', $locale));
    }

    private static function language(string $normalized): string
    {
        return explode('-', $normalized, 2)[0];
    }
}
