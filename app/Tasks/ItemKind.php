<?php

namespace App\Tasks;

/**
 * What a planner item is (the client's `PlannerTask['kind']`, see "Recurring tasks (client)" in
 * docs/architecture.md).
 */
enum ItemKind: string
{
    /** A plain row. */
    case Task = 'task';

    /** A series row: it holds the rule and is never listed itself. */
    case Series = 'series';

    /** Generated from a series, with no row of its own; its id is `${seriesId}:${YYYY-MM-DD}`. */
    case Occurrence = 'occurrence';

    /** A row that overrides one occurrence (changed, moved, done or deleted). */
    case Exception = 'exception';
}
