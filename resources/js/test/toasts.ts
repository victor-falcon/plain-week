import { screen, within } from '@testing-library/react';

/**
 * The action button (for example "Undo") of the toast showing `text`. Sonner
 * keeps toasts across tests, so several toasts can offer the same action.
 */
export async function toastAction(
    text: string,
    action = 'Undo',
): Promise<HTMLElement> {
    const toast = (await screen.findByText(text)).closest<HTMLElement>(
        '[data-sonner-toast]',
    );

    if (!toast) {
        throw new Error(`No toast shows "${text}".`);
    }

    return within(toast).getByRole('button', { name: action });
}
