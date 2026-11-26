import { describe, expect, it } from 'vite-plus/test';
import {
    findLabel,
    labelKey,
    labelTag,
    resolveLabels,
    validateLabelNames,
} from './task-labels';

describe('resolveLabels', () => {
    it('lists every colour but none, with default names unless renamed', () => {
        const labels = resolveLabels([
            { color: 'pink', name: 'Deep work', updated_at: '' },
            { color: 'green', name: '', updated_at: '' },
        ]);

        expect(labels.map((label) => label.color)).toEqual([
            'pink',
            'yellow',
            'black',
            'grey',
            'cornflower',
            'mango',
            'green',
            'lilac',
        ]);
        expect(labels[0]).toEqual({
            color: 'pink',
            name: 'Deep work',
            customName: 'Deep work',
            isCustom: true,
        });
        expect(labels[6]).toEqual({
            color: 'green',
            name: 'Green',
            customName: null,
            isCustom: false,
        });
    });
});

describe('labelTag and labelKey', () => {
    it('turns a name into the tag typed after #', () => {
        expect(labelTag('Deep work')).toBe('deep-work');
        expect(labelTag('  Deep   Work ')).toBe('deep-work');
        expect(labelTag('Pink')).toBe('pink');
    });

    it('matches regardless of case, spaces and hyphens', () => {
        expect(labelKey('Deep work')).toBe('deepwork');
        expect(labelKey('deep-work')).toBe('deepwork');
        expect(labelKey('DEEPWORK')).toBe('deepwork');
    });
});

describe('findLabel', () => {
    const labels = resolveLabels([
        { color: 'pink', name: 'Deep work', updated_at: '' },
    ]);

    it('finds a label by its tag, its name or its colour id', () => {
        expect(findLabel('deep-work', labels)?.color).toBe('pink');
        expect(findLabel('DeepWork', labels)?.color).toBe('pink');
        expect(findLabel('pink', labels)?.color).toBe('pink');
        expect(findLabel('green', labels)?.color).toBe('green');
        expect(findLabel('Cornflower', labels)?.color).toBe('cornflower');
    });

    it('returns null for no match or an empty query', () => {
        expect(findLabel('deep', labels)).toBeNull();
        expect(findLabel('', labels)).toBeNull();
        expect(findLabel('-', labels)).toBeNull();
    });

    it('prefers the colour id over another label named like it', () => {
        const clash = resolveLabels([
            { color: 'pink', name: 'Green', updated_at: '' },
        ]);

        expect(findLabel('green', clash)?.color).toBe('green');
    });
});

describe('validateLabelNames', () => {
    it('accepts distinct custom names and default ones', () => {
        expect(
            validateLabelNames({ pink: 'Deep work', green: '', lilac: 'Home' }),
        ).toEqual({});
        expect(validateLabelNames({ pink: 'pink', yellow: 'Yellow' })).toEqual(
            {},
        );
    });

    it('refuses a name another custom name already has', () => {
        expect(
            validateLabelNames({ pink: 'Deep work', mango: 'deep-work' }),
        ).toEqual({ pink: 'duplicate', mango: 'duplicate' });
    });

    it('refuses another colour’s id or default name', () => {
        expect(validateLabelNames({ pink: 'Green' })).toEqual({
            pink: 'reserved',
        });
        expect(validateLabelNames({ pink: 'corn-flower' })).toEqual({
            pink: 'reserved',
        });
        // Still reserved after green is renamed: #green always means green.
        expect(validateLabelNames({ pink: 'green', green: 'Health' })).toEqual({
            pink: 'reserved',
        });
    });

    it('refuses a name no tag can reach', () => {
        expect(validateLabelNames({ pink: '- -' })).toEqual({
            pink: 'invalid',
        });
    });

    it('refuses names that are too long', () => {
        expect(validateLabelNames({ pink: 'a'.repeat(25) })).toEqual({
            pink: 'tooLong',
        });
    });
});
