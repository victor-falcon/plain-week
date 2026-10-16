<?php

namespace App\Console\Commands;

use App\Billing\LifetimeAccess;
use App\Models\User;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('plainweek:grant-lifetime {email : The email of the account} {--revoke : Remove lifetime access instead}')]
#[Description('Grant (or revoke) lifetime access to an account without a payment')]
class GrantLifetime extends Command
{
    public function handle(LifetimeAccess $lifetime): int
    {
        $user = User::where('email', $this->argument('email'))->first();

        if ($user === null) {
            $this->error('No account has this email.');

            return self::FAILURE;
        }

        $email = $user->email;

        if ($this->option('revoke')) {
            $lifetime->revoke($user);
            $this->info("Lifetime access revoked for {$email}.");

            return self::SUCCESS;
        }

        $lifetime->grant($user);
        $this->info("Lifetime access granted to {$email}.");

        return self::SUCCESS;
    }
}
