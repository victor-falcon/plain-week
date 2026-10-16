import type { SVGAttributes } from 'react';

import { cn } from '@/lib/utils';

// One continuous line drawing a lowercase "pw" on a 32 grid: the p's stem
// drops below the baseline and the same line runs on into the w. Same
// geometry as resources/images/pwa/*.svg. Its ink is the brand's, not
// theme tokens, so it looks the same whatever the preset.
export default function AppLogoIcon({
    className,
    ...props
}: SVGAttributes<SVGElement>) {
    return (
        <svg
            {...props}
            viewBox="0 0 32 32"
            xmlns="http://www.w3.org/2000/svg"
            className={cn('text-[#18181B] dark:text-[#FAFAFA]', className)}
        >
            <path
                d="M5 25.5V9.75a2.75 2.75 0 0 1 5.5 0v8.5a2.75 2.75 0 0 0 5.5 0v-5.5a2.75 2.75 0 0 1 5.5 0v5.5a2.75 2.75 0 0 0 5.5 0V7.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={3.5}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
