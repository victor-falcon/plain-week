/** Settings › Labels: the names of the task colors. */
export const labels = {
    'labels.title': 'Labels',
    'labels.description':
        'Each task color is a label. Name them to match how you plan, then type #name in a new task to apply one. Names sync across your devices.',
    'labels.footnote':
        'Leave a name empty to use the color name. Renaming a label never changes the color of existing tasks.',
    'labels.reset': 'Reset {color} to its color name',
    'labels.resetTooltip': 'Use the color name',
    'labels.errorDuplicate': 'Already used by {color}. Pick another name.',
    'labels.errorReserved': '“{name}” is the name of another color.',
    'labels.errorTooLong': 'Use at most {max} characters.',
    'labels.errorInvalid': 'Use at least one letter or number.',
} as const;
