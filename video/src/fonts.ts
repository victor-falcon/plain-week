import { useState } from 'react';
import { continueRender, delayRender } from 'remotion';

/** The weights the video uses, of the app's Inter Variable. */
const FACES = [
    '400 16px "Inter Variable"',
    '500 16px "Inter Variable"',
    '700 16px "Inter Variable"',
];

/**
 * Holds the render until Inter is loaded, so no frame is drawn with the
 * fallback font.
 */
export function useFonts(): void {
    useState(() => {
        const handle = delayRender('Loading Inter');

        Promise.all([
            ...FACES.map((face) => document.fonts.load(face)),
            document.fonts.load('400 16px "JetBrains Mono Variable"'),
        ])
            .then(() => continueRender(handle))
            .catch(() => continueRender(handle));

        return handle;
    });
}
