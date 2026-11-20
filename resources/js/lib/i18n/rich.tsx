import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { t } from '@/lib/i18n';
import type { MessageParams, TextKey } from '@/lib/i18n';

type Renderers = Record<string, (children: ReactNode) => ReactNode>;

/**
 * `t()` for a sentence with markup in it: `<name>…</name>` in the message is
 * rendered by `components.name`, so a translation can move a link around
 * without the code splitting the sentence. Tags do not nest.
 *
 *     tRich('auth.terms', { terms: (text) => <TextLink href="/terms">{text}</TextLink> })
 *     // "By signing up you agree to the <terms>Terms</terms>."
 */
export function tRich(
    key: TextKey,
    components: Renderers,
    params?: MessageParams,
): ReactNode {
    return renderRich(t(key, params), components);
}

export function renderRich(text: string, components: Renderers): ReactNode {
    const parts: ReactNode[] = [];
    const pattern = /<(\w+)>(.*?)<\/\1>/gs;
    let last = 0;

    for (const match of text.matchAll(pattern)) {
        const [whole, name, inner] = match;
        const index = match.index ?? 0;
        const render = components[name];

        parts.push(text.slice(last, index));
        parts.push(
            <Fragment key={index}>{render ? render(inner) : inner}</Fragment>,
        );
        last = index + whole.length;
    }

    parts.push(text.slice(last));

    return <>{parts}</>;
}
