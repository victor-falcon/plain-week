import { cn } from '@/lib/utils';

/** Requests a person could give their agent, written like real prompts. */
export const AGENT_PROMPTS = [
    'Move everything unfinished to Friday.',
    'Plan next week from these notes.',
    "What's left for today?",
];

/** The example requests as quoted speech bubbles, the start corner squared. */
export function AgentPrompts({
    prompts = AGENT_PROMPTS,
    className,
}: {
    prompts?: string[];
    className?: string;
}) {
    return (
        <ul
            className={cn('flex flex-col items-start gap-2', className)}
            aria-label="Things you can ask"
        >
            {prompts.map((prompt) => (
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
