<?php

namespace App\Mcp\Support;

use App\Tasks\InvalidTaskChange;
use App\Tasks\PlannerItem;

/**
 * `before_id` / `after_id` checks. The repository ignores a neighbour that is not in the target list (the planner
 * never sends one); an agent gets an error instead, so a task never lands somewhere it did not ask for.
 */
final class Neighbours
{
    /**
     * @throws InvalidTaskChange
     */
    public static function check(Planner $planner, ?string $date, ?string $beforeId, ?string $afterId): void
    {
        if ($beforeId === null && $afterId === null) {
            return;
        }

        $ids = array_map(fn (PlannerItem $item) => $item->id(), $planner->tasks->listTasksIn($date));
        $list = $date === null ? 'Someday' : $date;

        foreach (['before_id' => $beforeId, 'after_id' => $afterId] as $field => $id) {
            if ($id !== null && ! in_array($id, $ids, true)) {
                throw new InvalidTaskChange("{$field} {$id} is not a task in {$list}. Use the id of a task listed there (occurrences by their occurrence id), or leave it out to add at the end.");
            }
        }
    }
}
