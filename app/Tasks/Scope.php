<?php

namespace App\Tasks;

/**
 * For an occurrence or exception: change only this one, or this one and every later one of its series. Ignored for
 * plain tasks.
 */
enum Scope: string
{
    case This = 'this';
    case Future = 'future';
}
