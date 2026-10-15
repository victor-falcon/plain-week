import type { SVGAttributes } from 'react';

import { cn } from '@/lib/utils';

// Seven days as bars on a 32 grid: Monday to Friday in ink (currentColor),
// the weekend in indigo after a slightly wider gap. Same geometry as
// public/favicon.svg.
const WEEKDAYS = [2, 6, 10, 14, 18];
const WEEKEND = [24, 28];

export default function AppLogoIcon({
    className,
    ...props
}: SVGAttributes<SVGElement>) {
    return (
        <svg
            {...props}
            viewBox="0 0 32 32"
            xmlns="http://www.w3.org/2000/svg"
            shapeRendering="crispEdges"
            className={cn('text-[#18181B] dark:text-[#FAFAFA]', className)}
        >
            {WEEKDAYS.map((x) => (
                <rect
                    key={x}
                    x={x}
                    y={4}
                    width={2}
                    height={24}
                    fill="currentColor"
                />
            ))}
            {WEEKEND.map((x) => (
                <rect
                    key={x}
                    x={x}
                    y={4}
                    width={2}
                    height={24}
                    className="fill-[#4F46E5] dark:fill-[#818CF8]"
                />
            ))}
        </svg>
    );
}
