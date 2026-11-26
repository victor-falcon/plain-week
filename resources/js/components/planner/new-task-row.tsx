import {
    useCallback,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import type { ChangeEvent, KeyboardEvent, Ref } from 'react';
import {
    CURSOR_ROW_CLASS,
    useCursorFocus,
    useKeyboardCursor,
} from '@/components/planner/keyboard-cursor';
import { ShortcutHint } from '@/components/planner/shortcut-hint';
import {
    LabelSuggestions,
    SmartTitleChips,
    SmartTitleMirror,
} from '@/components/planner/smart-title';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverAnchor,
    PopoverContent,
} from '@/components/ui/popover';
import { useTaskLabels } from '@/hooks/use-task-labels';
import { useToday } from '@/hooks/use-today';
import type { LabelColor } from '@/lib/db/types';
import {
    completeTag,
    parseNewTaskInput,
    suggestLabels,
} from '@/lib/planner/smart-input';
import type { ParsedNewTask } from '@/lib/planner/smart-input';
import type { TaskLabelView } from '@/lib/planner/task-labels';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Props = {
    ref?: Ref<HTMLInputElement>;
    label: string;
    /** The keyboard cursor is on this row (it is the list's last stop). */
    isCursor?: boolean;
    /**
     * Called with what the row read (text, date, time and colour) and the
     * trimmed input when the row is submitted.
     */
    onSubmit: (task: ParsedNewTask, input: string) => void;
    /** Called when Esc cancels the row and leaves the list. */
    onCancel?: () => void;
    className?: string;
};

/**
 * Shared by the input and its mirror, so both lay the text out the same:
 * padding (wider while typing), font size, line height.
 */
const FIELD_TEXT =
    'px-1.5 text-base group-focus-within/field:px-3.5 md:text-sm';

/**
 * An empty ruled row that adds a task: type, then Enter (or leave the row)
 * to create it; Esc cancels. A leading date and time and a `#label` anywhere
 * are read as the task's date, time and colour (`parseNewTaskInput`): marked
 * in place, previewed under the row, and a `#tag` being typed suggests labels.
 */
export function NewTaskRow({
    ref,
    label,
    isCursor = false,
    onSubmit,
    onCancel,
    className,
}: Props) {
    const stopRef = useCursorFocus<HTMLDivElement>(isCursor);
    // Keys act on the cursor's row while it is shown, not the hovered one.
    const cursorShown = useKeyboardCursor() !== null;
    const { labels } = useTaskLabels();
    const today = useToday();
    const chipsId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const mirrorRef = useRef<HTMLSpanElement>(null);
    const caretRef = useRef<number | null>(null);

    const [value, setValue] = useState('');
    // The latest value, for a blur that follows a reset in the same event.
    const valueRef = useRef('');
    const [focused, setFocused] = useState(false);
    // Esc closes the suggestions of the tag that starts here, until it is gone.
    const [dismissedAt, setDismissedAt] = useState<number | null>(null);
    const [activeColor, setActiveColor] = useState<LabelColor | undefined>();
    const [listIds, setListIds] = useState<{
        list?: string;
        active?: string;
    }>({});

    const parsed = useMemo(
        () => parseNewTaskInput(value, today, labels),
        [value, today, labels],
    );
    const { tag } = parsed;
    const suggestions = useMemo(
        () => (tag ? suggestLabels(tag.query, labels) : []),
        [tag, labels],
    );
    const open = focused && tag !== null && dismissedAt !== tag.start;
    const active =
        suggestions.find((item) => item.color === activeColor) ??
        suggestions[0];

    const setInputRef = (input: HTMLInputElement | null) => {
        inputRef.current = input;

        if (typeof ref === 'function') {
            ref(input);
        } else if (ref) {
            ref.current = input;
        }
    };

    // The mirror follows the input's scroll (long text) and the caret after a pick.
    const syncScroll = () => {
        const input = inputRef.current;

        if (input && mirrorRef.current) {
            mirrorRef.current.style.transform = `translateX(${-input.scrollLeft}px)`;
        }
    };

    useLayoutEffect(() => {
        const input = inputRef.current;

        if (input && caretRef.current !== null) {
            input.setSelectionRange(caretRef.current, caretRef.current);
            caretRef.current = null;
        }

        syncScroll();
    }, [value]);

    // cmdk gives the list and its options their own ids: follow the list and
    // its highlighted option for the input's combobox attributes.
    const listRef = useCallback((list: HTMLDivElement | null) => {
        if (list === null) {
            return;
        }

        const read = () => {
            const next = {
                list: list.id,
                active:
                    list.querySelector('[role="option"][aria-selected="true"]')
                        ?.id || undefined,
            };
            setListIds((ids) =>
                ids.list === next.list && ids.active === next.active
                    ? ids
                    : next,
            );
        };
        const observer = new MutationObserver(read);
        observer.observe(list, {
            attributes: true,
            attributeFilter: ['id', 'aria-selected'],
            childList: true,
            subtree: true,
        });
        read();

        return () => observer.disconnect();
    }, []);

    const changeValue = (next: string) => {
        valueRef.current = next;
        setValue(next);
    };

    const reset = () => {
        changeValue('');
        setDismissedAt(null);
        setActiveColor(undefined);
    };

    const submit = () => {
        const input = valueRef.current.trim();
        reset();

        if (input !== '') {
            onSubmit(parseNewTaskInput(input, today, labels), input);
        }
    };

    const pick = (picked: TaskLabelView) => {
        if (tag === null) {
            return;
        }

        const completed = completeTag(value, tag, picked.name);
        caretRef.current = completed.caret;
        changeValue(completed.value);
        setActiveColor(undefined);
    };

    const moveActive = (step: 1 | -1) => {
        const index = active ? suggestions.indexOf(active) : -1;
        const next = (index + step + suggestions.length) % suggestions.length;
        setActiveColor(suggestions[next].color);
    };

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        changeValue(event.currentTarget.value);
        setActiveColor(undefined);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.nativeEvent.isComposing) {
            return;
        }

        if (open && suggestions.length > 0) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                moveActive(event.key === 'ArrowDown' ? 1 : -1);

                return;
            }

            if ((event.key === 'Enter' || event.key === 'Tab') && active) {
                event.preventDefault();
                pick(active);

                return;
            }
        }

        if (open && event.key === 'Escape') {
            event.preventDefault();
            setDismissedAt(tag.start);

            return;
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            submit();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            reset();
            event.currentTarget.blur();
            onCancel?.();
        }
    };

    const handleBlur = () => {
        setFocused(false);
        submit();
    };

    const hasChips =
        parsed.date !== null || parsed.time !== null || parsed.color !== null;

    return (
        // The keyboard cursor stops on the row itself, not its input: keys
        // pressed there are shortcuts; Enter, `a` or `i` start typing.
        <div
            ref={stopRef}
            data-new-task-row
            data-cursor={isCursor || undefined}
            tabIndex={-1}
            role="group"
            aria-label={t('planner.newTaskRowLabel', { label })}
            className={cn(
                'group/new relative h-row border-b border-border outline-none max-lg:scroll-mt-20',
                CURSOR_ROW_CLASS,
                // Typing: the input's own lifted look replaces the cursor.
                'has-[input:focus]:bg-transparent has-[input:focus]:before:hidden',
                className,
            )}
        >
            <Popover open={open}>
                <PopoverAnchor asChild>
                    {/* Typing lifts the field: a background, a shadow and
                        wider padding. */}
                    <div
                        data-smart-field
                        className="group/field peer relative h-full focus-within:z-10 focus-within:-mx-2 focus-within:rounded-sm focus-within:bg-background focus-within:shadow-md"
                    >
                        <SmartTitleMirror
                            ref={mirrorRef}
                            value={value}
                            parsed={parsed}
                            className={FIELD_TEXT}
                        />
                        <Input
                            ref={setInputRef}
                            type="text"
                            aria-label={label}
                            role="combobox"
                            aria-autocomplete="list"
                            aria-expanded={open}
                            aria-controls={open ? listIds.list : undefined}
                            aria-activedescendant={
                                open ? listIds.active : undefined
                            }
                            aria-describedby={focused ? chipsId : undefined}
                            autoComplete="off"
                            enterKeyHint="done"
                            value={value}
                            onChange={handleChange}
                            onKeyDown={handleKeyDown}
                            onFocus={() => setFocused(true)}
                            onBlur={handleBlur}
                            onScroll={syncScroll}
                            onSelect={syncScroll}
                            className={cn(
                                FIELD_TEXT,
                                'relative h-full rounded-none border-0 bg-transparent text-transparent caret-foreground shadow-none selection:bg-primary/25 selection:text-transparent focus-visible:ring-0',
                            )}
                        />
                        {focused && (
                            <SmartTitleChips
                                id={chipsId}
                                parsed={parsed}
                                labels={labels}
                                showHint={value === ''}
                            />
                        )}
                    </div>
                </PopoverAnchor>
                <PopoverContent
                    align="start"
                    sideOffset={hasChips ? 32 : 4}
                    className="w-64 gap-0 rounded-2xl p-0"
                    // Focus stays in the title: the list is driven from there.
                    onOpenAutoFocus={(event) => event.preventDefault()}
                    onCloseAutoFocus={(event) => event.preventDefault()}
                    // A pick with the mouse or a finger must not blur the
                    // title, which would create the task.
                    onMouseDown={(event) => event.preventDefault()}
                >
                    <LabelSuggestions
                        ref={listRef}
                        query={tag?.query ?? ''}
                        suggestions={suggestions}
                        active={active?.color}
                        onActiveChange={setActiveColor}
                        onPick={pick}
                    />
                </PopoverContent>
            </Popover>
            {/* Enter starts typing here (`a` and `i` too); gone while
                typing. */}
            <ShortcutHint
                action="task.open"
                size="row"
                className={cn(
                    'pointer-events-none absolute end-1.5 top-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-200 group-data-cursor/new:opacity-100 peer-focus-within:hidden',
                    !cursorShown && 'group-hover/new:opacity-100',
                )}
            />
        </div>
    );
}
