import { t } from '@/lib/i18n';

/** Requests a person could give their agent, written like real prompts (the landing card). */
export function agentPrompts(): string[] {
    return [
        t('announcement.prompt.move'),
        t('announcement.prompt.plan'),
        t('announcement.prompt.today'),
    ];
}

/** The two the announcement card shows. */
export function announcementPrompts(): string[] {
    return [t('announcement.prompt.move'), t('announcement.prompt.today')];
}

/** The example requests as quoted speech bubbles, the start corner squared. */
export function AgentPrompts({ prompts }: { prompts?: string[] }) {
    return (
        <ul
            className="flex flex-col items-start gap-2"
            aria-label={t('announcement.promptsLabel')}
        >
            {(prompts ?? agentPrompts()).map((prompt) => (
                <li
                    key={prompt}
                    className="rounded-2xl rounded-ss-sm bg-muted px-3.5 py-2 text-sm text-foreground"
                >
                    &ldquo;{prompt}&rdquo;
                </li>
            ))}
        </ul>
    );
}
