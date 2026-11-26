import { announcement } from './en/announcement';
import { app } from './en/app';
import { auth } from './en/auth';
import { billing } from './en/billing';
import { common } from './en/common';
import { labels } from './en/labels';
import { landing } from './en/landing';
import { planner } from './en/planner';
import { pwa } from './en/pwa';
import { preferences } from './en/preferences';
import { settings } from './en/settings';
import { task } from './en/task';

/**
 * The bundled English catalog: every user-facing string of the React app.
 * Keys are `<area>.<name>`, one file per area under `./en`. A value is a
 * string with `{name}` placeholders, or a plural (`{ one, other }`, any
 * `Intl.PluralRules` category). Instances translate or reword these keys
 * with JSON files (docs/self-hosting.md#translations).
 */
export const en = {
    ...common,
    ...app,
    ...planner,
    ...pwa,
    ...task,
    ...settings,
    ...preferences,
    ...labels,
    ...auth,
    ...billing,
    ...landing,
    ...announcement,
} as const;
