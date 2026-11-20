// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { configureI18n } from '@/lib/i18n';
import Preferences from './preferences';

const patch = vi.fn();
let language: string | null = null;

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    usePage: () => ({ props: { auth: { user: { id: 7, language } } } }),
    router: { patch: (...args: unknown[]) => patch(...args) },
}));

afterEach(() => {
    cleanup();
    configureI18n(undefined);
    patch.mockReset();
    language = null;
});

describe('the language setting', () => {
    it('is hidden while the instance offers English only', () => {
        render(<Preferences />);

        expect(
            screen.queryByText('Language', { selector: 'h3, label' }),
        ).toBeNull();
        expect(
            document.querySelector('[data-test="language-select"]'),
        ).toBeNull();
    });

    it('lists the browser default and every offered language', async () => {
        configureI18n({ locale: 'en', locales: ['en', 'de'], messages: {} });
        const user = userEvent.setup();
        render(<Preferences />);

        const select = screen.getByRole('combobox', { name: 'Language' });
        expect(select.textContent).toContain('Browser default');

        await user.click(select);
        await user.click(
            await screen.findByRole('option', { name: 'Deutsch' }),
        );

        expect(patch).toHaveBeenCalledWith(
            '/settings/language',
            { language: 'de' },
            { preserveScroll: true },
        );
    });

    it('shows the account language and can go back to the browser', async () => {
        configureI18n({ locale: 'de', locales: ['en', 'de'], messages: {} });
        language = 'de';
        const user = userEvent.setup();
        render(<Preferences />);

        const select = screen.getByRole('combobox', { name: 'Language' });
        expect(select.textContent).toContain('Deutsch');

        await user.click(select);
        await user.click(
            await screen.findByRole('option', { name: 'Browser default' }),
        );

        expect(patch).toHaveBeenCalledWith(
            '/settings/language',
            { language: null },
            { preserveScroll: true },
        );
    });
});
