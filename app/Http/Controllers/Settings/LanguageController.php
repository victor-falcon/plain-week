<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\Translations;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class LanguageController extends Controller
{
    /**
     * Settings › Preferences › Language: one of the instance's locales, or null to follow the browser.
     */
    public function update(Request $request, Translations $translations): RedirectResponse
    {
        $validated = $request->validate([
            'language' => ['nullable', 'string', Rule::in($translations->available())],
        ]);

        /** @var User $user */
        $user = $request->user();
        $user->forceFill(['language' => $validated['language'] ?? null])->save();

        return back();
    }
}
