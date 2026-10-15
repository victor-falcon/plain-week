<?php

namespace App\Http\Controllers;

use Illuminate\Http\Response;

class RobotsController extends Controller
{
    /**
     * robots.txt: allow everything, or nothing when APP_NOINDEX is on.
     */
    public function __invoke(): Response
    {
        $rules = config('app.noindex') ? "User-agent: *\nDisallow: /\n" : "User-agent: *\nDisallow:\n";

        return response($rules)->header('Content-Type', 'text/plain; charset=UTF-8');
    }
}
