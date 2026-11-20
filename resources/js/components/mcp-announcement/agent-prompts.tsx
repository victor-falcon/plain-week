/** Requests a person could give their agent, written like real prompts (the landing card). */
export const AGENT_PROMPTS = [
    'Move everything unfinished to Friday.',
    'Plan next week from these notes.',
    "What's left for today?",
];

/** The two the announcement card shows. */
export const ANNOUNCEMENT_PROMPTS = [AGENT_PROMPTS[0], AGENT_PROMPTS[2]];

/** The example requests as quoted speech bubbles, the start corner squared. */
export function AgentPrompts({
    prompts = AGENT_PROMPTS,
}: {
    prompts?: string[];
}) {
    return (
        <ul
            className="flex flex-col items-start gap-2"
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
