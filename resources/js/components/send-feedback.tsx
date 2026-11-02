import { usePage } from '@inertiajs/react';
import { MessageSquare } from 'lucide-react';
import type { ComponentProps } from 'react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

/**
 * Link attributes for the shared `feedbackUrl`: a mailto: opens the mail app
 * in place, a web page (GitHub Discussions) opens in a new tab.
 */
export function useFeedbackLink(): ComponentProps<'a'> {
    const href = usePage().props.feedbackUrl;
    const external = !href.startsWith('mailto:');

    return external
        ? { href, target: '_blank', rel: 'noopener noreferrer' }
        : { href };
}

/** "Send feedback" for the account menus (signed-in users and guests). */
export function SendFeedbackMenuItem({ onClick }: { onClick?: () => void }) {
    const link = useFeedbackLink();

    return (
        <DropdownMenuItem asChild>
            <a
                {...link}
                className="block w-full cursor-pointer"
                onClick={onClick}
                data-test="send-feedback"
            >
                <MessageSquare className="me-2" />
                Send feedback
            </a>
        </DropdownMenuItem>
    );
}
