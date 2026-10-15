import type { FocusEvent, KeyboardEvent, Ref } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Props = {
    ref?: Ref<HTMLInputElement>;
    label: string;
    /** Called with the trimmed text when the row is submitted. */
    onSubmit: (text: string, via: 'enter' | 'blur') => void;
    /** Called when Esc cancels the row and leaves the list. */
    onCancel?: () => void;
    className?: string;
};

/**
 * An empty ruled row that adds a task: type, then Enter (or leave the row)
 * to create it; Esc cancels.
 */
export function NewTaskRow({
    ref,
    label,
    onSubmit,
    onCancel,
    className,
}: Props) {
    const take = (input: HTMLInputElement): string => {
        const text = input.value.trim();
        input.value = '';

        return text;
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.nativeEvent.isComposing) {
            return;
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            const text = take(event.currentTarget);

            if (text !== '') {
                onSubmit(text, 'enter');
            }
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.currentTarget.value = '';
            event.currentTarget.blur();
            onCancel?.();
        }
    };

    const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
        const text = take(event.currentTarget);

        if (text !== '') {
            onSubmit(text, 'blur');
        }
    };

    return (
        <div
            data-new-task-row
            className={cn('h-row border-b border-border', className)}
        >
            <Input
                ref={ref}
                type="text"
                aria-label={label}
                autoComplete="off"
                enterKeyHint="done"
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                className="relative h-full rounded-none border-0 bg-transparent px-1.5 text-base shadow-none focus-visible:z-10 focus-visible:-mx-2 focus-visible:w-[calc(100%+1rem)] focus-visible:rounded-sm focus-visible:bg-background focus-visible:px-3.5 focus-visible:shadow-md focus-visible:ring-0 lg:text-sm"
            />
        </div>
    );
}
