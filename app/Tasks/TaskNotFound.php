<?php

namespace App\Tasks;

/**
 * The task (or occurrence) does not exist for this user, or was deleted.
 */
final class TaskNotFound extends TaskDomainException
{
    public static function withId(string $id): self
    {
        return new self("Task {$id} does not exist.");
    }
}
