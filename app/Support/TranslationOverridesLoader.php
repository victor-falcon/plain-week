<?php

namespace App\Support;

use Illuminate\Contracts\Translation\Loader;

/**
 * Lays the instance's translation files (App\Support\Translations) over Laravel's own JSON translations, so a
 * `<locale>.json` in TRANSLATIONS_PATH translates or rewords any `__('English text')` and any framework key
 * (`validation.required`). Only plain strings reach the server's translator; plural objects are for the React app.
 */
final readonly class TranslationOverridesLoader implements Loader
{
    public function __construct(private Loader $loader) {}

    /**
     * @return array<string, mixed>
     */
    public function load($locale, $group, $namespace = null): array
    {
        /** @var array<string, mixed> $lines */
        $lines = $this->loader->load($locale, $group, $namespace);

        if ($group !== '*' || $namespace !== '*') {
            return $lines;
        }

        $overrides = array_filter(app(Translations::class)->overrides($locale), is_string(...));

        return [...$lines, ...$overrides];
    }

    public function addNamespace($namespace, $hint): void
    {
        $this->loader->addNamespace($namespace, $hint);
    }

    public function addJsonPath($path): void
    {
        $this->loader->addJsonPath($path);
    }

    /**
     * @return array<string, string>
     */
    public function namespaces(): array
    {
        return $this->loader->namespaces();
    }
}
