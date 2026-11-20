<?php

namespace App\Tasks;

/**
 * A change the planner refuses: an invalid repeat rule, moving a series row, a Someday task that should repeat, or a
 * row that would not pass the sync push rules.
 */
final class InvalidTaskChange extends TaskDomainException {}
