import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { useClipboard } from '@/hooks/use-clipboard';

/** An icon button that copies `value`; the icon turns into a check once copied. */
export function CopyButton({
    value,
    label = 'Copy',
    'data-test': dataTest,
}: {
    value: string;
    label?: string;
    'data-test'?: string;
}) {
    const [copiedText, copy] = useClipboard();
    const copied = copiedText === value;

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={label}
                    data-test={dataTest}
                    onClick={async () => {
                        if (!(await copy(value))) {
                            toast.error(
                                'Could not copy. Select the text and copy it instead.',
                            );
                        }
                    }}
                >
                    {copied ? <Check /> : <Copy />}
                </Button>
            </TooltipTrigger>
            <TooltipContent>{copied ? 'Copied' : label}</TooltipContent>
        </Tooltip>
    );
}

/** A read-only value (a URL, a token, a command) with a copy button at its end. */
export function CopyField({
    value,
    label,
    multiline = false,
    'data-test': dataTest,
}: {
    value: string;
    /** Names the copy button ("Copy URL"). */
    label: string;
    /** Code that wraps over several lines instead of one scrolling line. */
    multiline?: boolean;
    'data-test'?: string;
}) {
    return (
        <div className="flex items-start gap-1 rounded-md border border-border bg-muted/50 py-1 ps-3 pe-1">
            <pre
                className={
                    multiline
                        ? 'min-w-0 flex-1 py-1.5 font-mono text-xs leading-5 break-all whitespace-pre-wrap'
                        : 'min-w-0 flex-1 overflow-x-auto py-1.5 font-mono text-xs leading-5'
                }
                dir="ltr"
                data-test={dataTest}
            >
                {value}
            </pre>
            <CopyButton value={value} label={label} />
        </div>
    );
}
