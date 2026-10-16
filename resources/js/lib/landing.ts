import { readStorage, writeStorage } from '@/lib/storage';
import type { Plan } from '@/types';

/** Set once a guest pressed "Start now": the landing card stays closed on this device. */
const DISMISSED_KEY = 'plain-week.landing-dismissed';
/** The plan a guest picked on the landing card, preselected on the plan choice after sign-up. */
const CHOSEN_PLAN_KEY = 'plain-week.chosen-plan';

const listeners = new Set<() => void>();

let dismissed = readStorage('local', DISMISSED_KEY) !== null;

function setDismissed(value: boolean) {
    dismissed = value;
    listeners.forEach((listener) => listener());
}

/** External store of the landing card's visibility, for `useSyncExternalStore`. */
export const landingStore = {
    subscribe: (listener: () => void) => {
        listeners.add(listener);

        return () => {
            listeners.delete(listener);
        };
    },
    isDismissed: () => dismissed,
    /** "Start now" (or Esc): closes the card and remembers it on this device. */
    dismiss: () => {
        writeStorage('local', DISMISSED_KEY, '1');
        setDismissed(true);
    },
    /** Shows the card again (from the guest menu), until the next load. */
    reopen: () => setDismissed(false),
};

export function rememberChosenPlan(plan: Plan) {
    writeStorage('session', CHOSEN_PLAN_KEY, plan);
}

/** The plan picked on the landing card in this tab, if any. */
export function chosenPlan(): Plan | null {
    const plan = readStorage('session', CHOSEN_PLAN_KEY);

    return plan === 'weekly' || plan === 'lifetime' ? plan : null;
}

export function forgetChosenPlan() {
    writeStorage('session', CHOSEN_PLAN_KEY, null);
}
