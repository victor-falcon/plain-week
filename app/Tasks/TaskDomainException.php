<?php

namespace App\Tasks;

use RuntimeException;

/**
 * A planner change that cannot be made. The message is meant for the user (or the agent acting for them).
 */
abstract class TaskDomainException extends RuntimeException {}
