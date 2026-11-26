// @vitest-environment happy-dom
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';
import { TooltipProvider } from '@/components/ui/tooltip';
import { db, wipeLocalDatabase } from '@/lib/db/database';
import { setLabelName } from '@/lib/db/labels';
import type { LabelColor } from '@/lib/db/types';
import Labels from './labels';

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    // A guest: the sync engine stays off.
    usePage: () => ({ props: { auth: { user: null } } }),
}));

beforeEach(async () => {
    await wipeLocalDatabase();
});

afterEach(() => {
    cleanup();
});

async function setup() {
    const user = userEvent.setup();
    render(
        <TooltipProvider>
            <Labels />
        </TooltipProvider>,
    );
    await screen.findByRole('list');

    return { user };
}

async function storedName(color: LabelColor): Promise<string | undefined> {
    return (await db.labels.get(color))?.name;
}

function row(color: LabelColor): HTMLElement {
    return document.querySelector<HTMLElement>(
        `[data-test="label-row-${color}"]`,
    )!;
}

function tag(color: LabelColor): string | null {
    return within(row(color)).getByText(/^#/).textContent;
}

describe('Settings › Labels', () => {
    it('lists a field for every label color, named after the color', async () => {
        await setup();

        expect(screen.getAllByRole('textbox').map((input) => input.id)).toEqual(
            [
                'label-pink',
                'label-yellow',
                'label-black',
                'label-grey',
                'label-cornflower',
                'label-mango',
                'label-green',
                'label-lilac',
            ],
        );
        const pink = screen.getByLabelText('Pink');
        expect(pink.getAttribute('placeholder')).toBe('Pink');
        expect(pink.getAttribute('maxlength')).toBe('24');
        expect(tag('pink')).toBe('#pink');
        expect(screen.queryByRole('button', { name: /^Reset / })).toBeNull();
    });

    it('renames a label as you type, without a save button', async () => {
        const { user } = await setup();

        await user.type(screen.getByLabelText('Pink'), 'Deep work');

        expect(tag('pink')).toBe('#deep-work');
        await waitFor(async () =>
            expect(await storedName('pink')).toBe('Deep work'),
        );
        expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
        expect(
            await screen.findByRole('button', {
                name: 'Reset Pink to its color name',
            }),
        ).toBeTruthy();
    });

    it('saves on blur without waiting', async () => {
        await setup();
        const field = screen.getByLabelText('Mango');

        fireEvent.change(field, { target: { value: 'Errands' } });
        fireEvent.blur(field);

        await waitFor(async () =>
            expect(await storedName('mango')).toBe('Errands'),
        );
    });

    it('resets a custom name to the color name', async () => {
        await setLabelName('green', 'Health');
        const { user } = await setup();

        expect((screen.getByLabelText('Green') as HTMLInputElement).value).toBe(
            'Health',
        );
        expect(tag('green')).toBe('#health');

        await user.click(
            screen.getByRole('button', {
                name: 'Reset Green to its color name',
            }),
        );

        await waitFor(async () => expect(await storedName('green')).toBe(''));
        expect((screen.getByLabelText('Green') as HTMLInputElement).value).toBe(
            '',
        );
        expect(tag('green')).toBe('#green');
        expect(
            screen.queryByRole('button', {
                name: 'Reset Green to its color name',
            }),
        ).toBeNull();
        // The button is gone: focus stays in the row.
        expect(document.activeElement).toBe(screen.getByLabelText('Green'));
    });

    it('does not save an earlier valid name when leaving with an invalid one', async () => {
        await setup();
        const field = screen.getByLabelText('Cornflower');

        fireEvent.change(field, { target: { value: 'ab' } });
        fireEvent.change(field, { target: { value: 'Green' } });
        cleanup();

        await new Promise((resolve) => setTimeout(resolve, 500));
        expect(await storedName('cornflower')).toBeUndefined();
    });

    it('saves a waiting name when leaving the page', async () => {
        await setup();

        fireEvent.change(screen.getByLabelText('Cornflower'), {
            target: { value: 'Calls' },
        });
        cleanup();

        await waitFor(async () =>
            expect(await storedName('cornflower')).toBe('Calls'),
        );
    });

    it('refuses a name another label already has', async () => {
        await setLabelName('pink', 'Work');
        const { user } = await setup();
        const field = screen.getByLabelText('Lilac');

        await user.type(field, 'work');
        await user.tab();

        expect(
            screen.getByText('Already used by Pink. Pick another name.'),
        ).toBeTruthy();
        expect(field.getAttribute('aria-invalid')).toBe('true');
        // The typed name stays in the field; the label keeps its name.
        expect((field as HTMLInputElement).value).toBe('work');
        expect(tag('lilac')).toBe('#lilac');
        await new Promise((resolve) => setTimeout(resolve, 500));
        expect(await storedName('lilac')).toBeUndefined();

        await user.clear(field);
        expect(
            screen.queryByText('Already used by Pink. Pick another name.'),
        ).toBeNull();
        expect(field.getAttribute('aria-invalid')).toBeNull();
    });

    it('refuses the name of another color', async () => {
        const { user } = await setup();
        const field = screen.getByLabelText('Black');

        await user.type(field, 'Green');

        expect(
            screen.getByText('“Green” is the name of another color.'),
        ).toBeTruthy();
        expect(field.getAttribute('aria-invalid')).toBe('true');
        await new Promise((resolve) => setTimeout(resolve, 500));
        expect(await storedName('black')).toBeUndefined();
    });

    it('treats the color’s own name as no custom name', async () => {
        const { user } = await setup();

        await user.type(screen.getByLabelText('Yellow'), 'yellow');
        await user.tab();

        expect(tag('yellow')).toBe('#yellow');
        await new Promise((resolve) => setTimeout(resolve, 500));
        expect(await storedName('yellow')).toBeUndefined();
    });

    it('shows a rename synced from another device', async () => {
        await setup();

        await setLabelName('grey', 'Admin');

        await waitFor(() =>
            expect(
                (screen.getByLabelText('Grey') as HTMLInputElement).value,
            ).toBe('Admin'),
        );
    });
});
