/**
 * Tracks the signed-in user across Inertia page loads. Returns `true` when the
 * user differs from the previous page (login, logout, profile change); the
 * first page only sets the baseline.
 */
export function createSessionChangeDetector(): (user: unknown) => boolean {
    let previous: string | undefined;

    return (user) => {
        const current = JSON.stringify(user ?? null);
        const changed = previous !== undefined && previous !== current;
        previous = current;

        return changed;
    };
}
