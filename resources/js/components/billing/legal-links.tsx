import TextLink from '@/components/text-link';
import { cn } from '@/lib/utils';
import { privacy, terms } from '@/routes/legal';

/** Terms of Service and Privacy Policy links (SaaS mode only). */
export function LegalLinks({ className }: { className?: string }) {
    return (
        <nav
            aria-label="Legal"
            className={cn(
                'flex justify-center gap-4 text-xs text-muted-foreground',
                className,
            )}
        >
            <TextLink href={terms()} className="text-muted-foreground">
                Terms of Service
            </TextLink>
            <TextLink href={privacy()} className="text-muted-foreground">
                Privacy Policy
            </TextLink>
        </nav>
    );
}
