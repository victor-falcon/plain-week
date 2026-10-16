<?php

namespace App\Http\Controllers;

use Inertia\Inertia;
use Inertia\Response;

/**
 * Terms of Service and Privacy Policy of the hosted service (SaaS mode only).
 */
class LegalController extends Controller
{
    public function terms(): Response
    {
        return Inertia::render('legal/terms', $this->props());
    }

    public function privacy(): Response
    {
        return Inertia::render('legal/privacy', $this->props());
    }

    /**
     * @return array<string, mixed>
     */
    private function props(): array
    {
        return [
            'seller' => config('saas.seller'),
            'appUrl' => config('app.url'),
        ];
    }
}
