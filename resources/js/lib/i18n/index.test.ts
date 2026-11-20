import { afterEach, describe, expect, it } from 'vitest';
import {
    availableLocales,
    configureI18n,
    currentLocale,
    intlLocale,
    languageName,
    t,
} from '@/lib/i18n';
import { formatLongDate, formatMonthTitle } from '@/lib/planner/format';

afterEach(() => configureI18n(undefined));

describe('t', () => {
    it('speaks the bundled English without any configuration', () => {
        expect(t('common.cancel')).toBe('Cancel');
        expect(currentLocale()).toBe('en');
        expect(availableLocales()).toEqual(['en']);
    });

    it('fills placeholders and leaves unknown ones as they are', () => {
        expect(t('planner.weekNumber', { week: '07' })).toBe('W07');

        configureI18n({
            locale: 'de',
            locales: ['en', 'de'],
            messages: { 'planner.weekNumber': 'KW{week} {missing}' },
        });

        expect(t('planner.weekNumber', { week: '07' })).toBe('KW07 {missing}');
    });

    it('lays the instance translations over English and falls back per key', () => {
        configureI18n({
            locale: 'pt_BR',
            locales: ['en', 'pt_BR'],
            messages: { 'common.cancel': 'Cancelar' },
        });

        expect(t('common.cancel')).toBe('Cancelar');
        expect(t('common.close')).toBe('Close');
        expect(intlLocale()).toBe('pt-BR');
    });

    it('ignores values that are not messages', () => {
        configureI18n({
            locale: 'de',
            locales: ['en', 'de'],
            messages: {
                'common.cancel': 42,
                'common.close': { one: 'no other' },
            } as never,
        });

        expect(t('common.cancel')).toBe('Cancel');
        expect(t('common.close')).toBe('Close');
    });

    it('picks the plural form of the active language', () => {
        configureI18n({
            locale: 'en',
            locales: ['en'],
            messages: {
                'common.cancel': {
                    zero: 'none',
                    one: '{count} item',
                    other: '{count} items',
                },
            },
        });

        // A plural override of a text key still renders.
        expect(t('common.cancel', { count: 0 })).toBe('none');
        expect(t('common.cancel', { count: 1 })).toBe('1 item');
        expect(t('common.cancel', { count: 5 })).toBe('5 items');
    });
});

describe('dates', () => {
    it('formats English the British way', () => {
        expect(formatLongDate('2026-10-12')).toBe('Mon, 12 Oct 2026');
    });

    it('follows the active language', () => {
        configureI18n({ locale: 'de', locales: ['en', 'de'], messages: {} });

        expect(formatMonthTitle(new Date(2026, 9, 1), 'long')).toBe(
            'Oktober 2026',
        );
    });
});

describe('languageName', () => {
    it('names a locale in its own language', () => {
        expect(languageName('de')).toBe('Deutsch');
        expect(languageName('en')).toBe('English');
    });
});
