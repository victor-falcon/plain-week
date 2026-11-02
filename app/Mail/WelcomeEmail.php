<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * The personal note a SaaS account gets once, when it first has access: plain
 * text, signed by the founder, asking one question. Replies go to the seller's
 * contact address. See App\Billing\WelcomeNewAccount.
 */
class WelcomeEmail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public bool $deleteWhenMissingModels = true;

    public function __construct(public User $user) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            replyTo: [new Address(config()->string('saas.seller.email'), 'Víctor')],
            subject: $this->spanish() ? 'Bienvenido a Plain Week — una pregunta' : 'Welcome to Plain Week — one question',
        );
    }

    public function content(): Content
    {
        return new Content(
            text: $this->spanish() ? 'mail.welcome-es' : 'mail.welcome-en',
            with: ['firstName' => $this->firstName()],
        );
    }

    private function spanish(): bool
    {
        return $this->user->locale === 'es';
    }

    /**
     * The first word of the account name, or null when there is none.
     */
    private function firstName(): ?string
    {
        $first = strtok(trim($this->user->name), " \t");

        return $first === false ? null : $first;
    }
}
