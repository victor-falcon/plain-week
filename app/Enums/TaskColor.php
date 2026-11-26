<?php

namespace App\Enums;

enum TaskColor: string
{
    case None = 'none';
    case Pink = 'pink';
    case Yellow = 'yellow';
    case Black = 'black';
    case Grey = 'grey';
    case Cornflower = 'cornflower';
    case Mango = 'mango';
    case Green = 'green';
    case Lilac = 'lilac';

    /**
     * Whether the color can have a label name (every color but `none`).
     */
    public function isLabel(): bool
    {
        return $this !== self::None;
    }
}
