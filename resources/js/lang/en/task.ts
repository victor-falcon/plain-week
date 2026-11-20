/** The task dialog, its pickers and the repeat scope prompt. */
export const task = {
    // Dialog
    'task.editTitle': 'Edit task',
    'task.taskLabel': 'Task',
    'task.notes': 'Notes',
    'task.notesPlaceholder': 'Add some extra notes here…',
    'task.markDone': 'Mark as done',
    'task.markNotDone': 'Mark as not done',
    'task.updateFailed': 'Could not update the task.',
    'task.moveFailed': 'Could not move the task.',
    'task.clear': 'Clear',
    'task.apply': 'Apply',

    // Toolbar
    'task.more': 'More',
    'task.tomorrow': 'Tomorrow',
    'task.nextWeek': 'Next week',
    'task.someday': 'Someday',
    'task.duplicate': 'Duplicate',
    'task.time': 'Time',
    'task.timeValue': 'Time: {time}',
    'task.setTime': 'Set time',
    'task.date': 'Date',
    'task.dateValue': 'Date: {date}',

    // Colors
    'task.color': 'Color',
    'task.colorValue': 'Color: {color}',
    'task.taskColor': 'Task color',

    // Subtasks
    'task.completeSubtask': 'Complete "{text}"',
    'task.deleteSubtask': 'Delete "{text}"',
    'task.subtask': 'Subtask',
    'task.addSubtask': 'Add subtask',
    'task.addSubtaskPlaceholder': 'Add subtask...',

    // Repeat picker
    'task.repeat': 'Repeat',
    'task.repeatValue': 'Repeat: {summary}',
    'task.repeatFailed': 'Could not change the repeat.',
    'task.repeatStopsSeries': 'Stops the whole series.',
    'task.repeatAppliesSeries': 'Applies to the whole series.',
    /** {date} is a long date such as "Mon, 12 Oct 2026". */
    'task.repeatStarts': 'Starts on {date}.',
    'task.repeatEndsEarly': 'Ends before it repeats once.',
    'task.repeatNever': 'Never',
    'task.repeatDaily': 'Daily',
    'task.repeatWeekly': 'Weekly',
    'task.repeatMonthlyOption': 'Monthly',
    'task.repeatWeekdaysLabel': 'Weekdays',
    /** {weekday} is the full weekday name of the task's own day. */
    'task.repeatAlwaysOn': "Always on {weekday}, the task's day.",
    /** Label before the day-of-month select. */
    'task.repeatMonthlyOnDay': 'Monthly on day',
    'task.dayOfMonth': 'Day of the month',
    'task.repeatLastDay': 'On the last day in shorter months.',
    /** Label before the number input: "Every [2] days". */
    'task.repeatEvery': 'Every',
    'task.numberOfDays': 'Number of days',
    /** Unit after the number input: "Every [2] days". */
    'task.repeatDayUnit': { one: 'day', other: 'days' },
    'task.repeatInvalidEvery': 'Enter a number of days from 1 to {max}.',
    /** Label before the end-date button. */
    'task.repeatEnds': 'Ends',
    'task.repeatEndsValue': 'Ends: {date}',
    'task.repeatNeverEnds': 'Never ends',

    // Repeat summary
    'task.repeatEveryDays': { one: 'Every day', other: 'Every {count} days' },
    'task.repeatMonthly': 'Monthly on day {day}',
    /** {days} are short weekday names joined with a separator: "Mon, Wed". */
    'task.repeatWeekdays': 'Every {days}',
    /** {summary} is the rule's summary, {date} the end date: "Every day, until 31 Dec". */
    'task.repeatUntil': '{summary}, until {date}',

    // Scope prompt
    'task.scopeEditTitle': 'Edit recurring task',
    'task.scopeEditDescription':
        'Change only this task, or this one and every later one?',
    'task.scopeDeleteTitle': 'Delete recurring task',
    'task.scopeDeleteDescription':
        'Delete only this task, or this one and every later one?',
    'task.scopeRepeatTitle': 'Change repeat',
    'task.scopeRepeatDescription':
        'Apply the new repeat to only this task (it becomes a series of its own), or to this one and every later one?',
    'task.scopeStopTitle': 'Stop repeating',
    'task.scopeStopDescription':
        'Turn only this task into a one-off task, or stop the series from this task on?',
    'task.scopeRemembered':
        'Your answer applies to your other changes until you close the task.',
    'task.scopeFuture': 'This and all future',
    'task.scopeThis': 'Only this task',
} as const;
