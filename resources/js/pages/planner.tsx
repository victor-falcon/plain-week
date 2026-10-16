import { Head } from '@inertiajs/react';

/**
 * The planner itself is the persistent `PlannerLayout` (see `app.tsx`), so
 * the sign-in, sign-up and plan pages can float over it without remounting
 * it; this page only sets the title.
 */
export default function Planner() {
    return <Head title="Planner" />;
}
