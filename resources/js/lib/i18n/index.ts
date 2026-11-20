import { en } from '@/lang/en';

/**
 * Translations. English is bundled (`resources/js/lang/en`); the instance can
 * add languages or reword English with JSON files the server delivers in the
 * `i18n` page props (docs/self-hosting.md#translations). The catalog is set
 * once, before the first render, from the page that loaded the app (the
 * cached offline shell included), so `t()` never waits on the network.
 */

/** A plural message: one text per `Intl.PluralRules` category. */
export type PluralMessage = Partial<Record<Intl.LDMLPluralRule, string>> & {
    other: string;
};

export type Message = string | PluralMessage;

export type MessageKey = keyof typeof en;

/** Keys whose English text is a plural: they need a `count`. */
export type PluralKey = {
    [K in MessageKey]: (typeof en)[K] extends string ? never : K;
}[MessageKey];

export type TextKey = Exclude<MessageKey, PluralKey>;

export type MessageParams = Record<string, string | number>;

export type I18nProps = {
    /** The active locale, as the server names it (`de`, `pt_BR`). */
    locale: string;
    /** Every locale the instance offers, English first. */
    locales: string[];
    /** The instance's translations over the bundled English catalog. */
    messages: Record<string, Message>;
};

type Catalog = {
    locale: string;
    locales: string[];
    messages: Record<string, Message>;
};

const BUNDLED_LOCALE = 'en';

let catalog: Catalog = {
    locale: BUNDLED_LOCALE,
    locales: [BUNDLED_LOCALE],
    messages: en,
};

let pluralRules: Intl.PluralRules | undefined;

/**
 * Sets the active language. Called by `app.tsx` with the first page's
 * `i18n` props; a language change reloads the page.
 */
export function configureI18n(props: Partial<I18nProps> | undefined): void {
    const messages: Record<string, Message> = { ...en };

    for (const [key, value] of Object.entries(props?.messages ?? {})) {
        if (isMessage(value)) {
            messages[key] = value;
        }
    }

    catalog = {
        locale: props?.locale || BUNDLED_LOCALE,
        locales: props?.locales?.length ? props.locales : [BUNDLED_LOCALE],
        messages,
    };
    pluralRules = undefined;
}

/** The active locale as the server names it (`pt_BR`). */
export function currentLocale(): string {
    return catalog.locale;
}

/** The active locale as a BCP 47 tag for `Intl` (`pt-BR`). */
export function intlLocale(): string {
    return toLanguageTag(catalog.locale);
}

/** Every locale the instance offers, English first. */
export function availableLocales(): readonly string[] {
    return catalog.locales;
}

export function toLanguageTag(locale: string): string {
    return locale.replace(/_/g, '-');
}

/**
 * A locale's name in its own language ("Deutsch", "português (Brasil)"),
 * for the language picker; the code itself when the browser has no name.
 */
export function languageName(locale: string): string {
    const tag = toLanguageTag(locale);

    try {
        const name = new Intl.DisplayNames([tag], { type: 'language' }).of(tag);

        return name
            ? name.charAt(0).toLocaleUpperCase(tag) + name.slice(1)
            : tag;
    } catch {
        return tag;
    }
}

/**
 * The text for `key` in the active language, with `{name}` placeholders
 * filled from `params`. Plural keys need `params.count`.
 */
export function t(key: TextKey, params?: MessageParams): string;
export function t(
    key: PluralKey,
    params: MessageParams & { count: number },
): string;
export function t(key: MessageKey, params?: MessageParams): string {
    return interpolate(pick(catalog.messages[key] ?? en[key], params), params);
}

function pick(message: Message, params?: MessageParams): string {
    if (typeof message === 'string') {
        return message;
    }

    const count = Number(params?.count ?? 0);
    pluralRules ??= new Intl.PluralRules(intlLocale());

    // An exact `zero` reads better than "0 tasks" in languages that allow it.
    if (count === 0 && message.zero !== undefined) {
        return message.zero;
    }

    return message[pluralRules.select(count)] ?? message.other;
}

function interpolate(text: string, params?: MessageParams): string {
    if (!params) {
        return text;
    }

    return text.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in params ? String(params[name]) : match,
    );
}

function isMessage(value: unknown): value is Message {
    if (typeof value === 'string') {
        return true;
    }

    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as { other?: unknown }).other === 'string'
    );
}
