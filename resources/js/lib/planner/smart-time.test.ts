import { describe, expect, it } from 'vite-plus/test';
import { parseSmartTime } from './smart-time';

describe('parseSmartTime', () => {
    it('extracts a leading HH:mm time', () => {
        expect(parseSmartTime('17:30 Gym')).toEqual({
            text: 'Gym',
            time: '17:30',
        });
    });

    it('pads a leading H:mm time', () => {
        expect(parseSmartTime('9:05 Call mom')).toEqual({
            text: 'Call mom',
            time: '09:05',
        });
    });

    it('accepts midnight and the last minute of the day', () => {
        expect(parseSmartTime('0:00 a').time).toBe('00:00');
        expect(parseSmartTime('23:59 b').time).toBe('23:59');
    });

    it('trims the text', () => {
        expect(parseSmartTime('  08:00   Run  ')).toEqual({
            text: 'Run',
            time: '08:00',
        });
    });

    it('leaves text without a leading time untouched', () => {
        expect(parseSmartTime('Call mom at 18:00')).toEqual({
            text: 'Call mom at 18:00',
            time: null,
        });
    });

    it('ignores invalid times', () => {
        expect(parseSmartTime('24:00 Late').time).toBeNull();
        expect(parseSmartTime('12:60 Late').time).toBeNull();
        expect(parseSmartTime('123:00 Late').time).toBeNull();
        expect(parseSmartTime('7:5 Late').time).toBeNull();
    });

    it('needs text after the time', () => {
        expect(parseSmartTime('17:30')).toEqual({ text: '17:30', time: null });
        expect(parseSmartTime('17:30   ')).toEqual({
            text: '17:30',
            time: null,
        });
    });

    it('needs a space between the time and the text', () => {
        expect(parseSmartTime('17:30Gym').time).toBeNull();
    });
});
