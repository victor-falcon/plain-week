import { Form, Head, usePage } from '@inertiajs/react';
import AppLogoIcon from '@/components/app-logo-icon';
import {
    AuthField,
    AuthFootnote,
    AuthSubmit,
    authInputClass,
    closeToPlanner,
} from '@/components/auth/auth-form';
import { FloatingCard } from '@/components/floating-card';
import PasswordInput from '@/components/password-input';
import TextLink from '@/components/text-link';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { login } from '@/routes';
import { privacy, terms } from '@/routes/legal';
import { store } from '@/routes/register';
import { t } from '@/lib/i18n';
import { tRich } from '@/lib/i18n/rich';

type Props = {
    passwordRules: string;
};

/** "How did you hear about Plain Week?": the values match `App\Enums\ReferralSource`. */
function referralSources() {
    return [
        { value: 'x', label: t('auth.referralX') },
        { value: 'substack', label: t('auth.referralSubstack') },
        { value: 'reddit', label: t('auth.referralReddit') },
        { value: 'hacker_news', label: t('auth.referralHackerNews') },
        { value: 'friend', label: t('auth.referralFriend') },
        { value: 'other', label: t('auth.referralOther') },
    ];
}

/**
 * Sign-up. In SaaS mode it is step 1 of 2: the server then sends the new
 * account to the plan choice (`/plans`).
 */
export default function Register({ passwordRules }: Props) {
    const saasEnabled = usePage().props.saas?.enabled ?? false;

    return (
        <>
            <Head title={t('auth.register')} />

            <FloatingCard
                title={t('auth.createYourAccount')}
                description={
                    saasEnabled
                        ? t('auth.registerDescriptionSaas')
                        : t('auth.registerDescription')
                }
                onBack={closeToPlanner}
                onClose={closeToPlanner}
                icon={<AppLogoIcon className="size-9 shrink-0" aria-hidden />}
                toolbar={
                    saasEnabled && (
                        <span className="mx-auto">{t('auth.stepOfTwo')}</span>
                    )
                }
            >
                <Form
                    {...store.form()}
                    resetOnSuccess={['password']}
                    disableWhileProcessing
                    className="flex flex-col gap-5"
                >
                    {({ processing, errors }) => (
                        <>
                            <AuthField
                                id="name"
                                label={t('auth.name')}
                                error={errors.name}
                            >
                                <Input
                                    id="name"
                                    type="text"
                                    name="name"
                                    required
                                    autoFocus
                                    autoComplete="name"
                                    placeholder={t('auth.namePlaceholder')}
                                    aria-invalid={!!errors.name}
                                    className={authInputClass}
                                />
                            </AuthField>

                            <AuthField
                                id="email"
                                label={t('auth.email')}
                                error={errors.email}
                            >
                                <Input
                                    id="email"
                                    type="email"
                                    name="email"
                                    required
                                    autoComplete="email"
                                    placeholder={t('auth.emailPlaceholder')}
                                    aria-invalid={!!errors.email}
                                    className={authInputClass}
                                />
                            </AuthField>

                            <AuthField
                                id="password"
                                label={t('auth.password')}
                                error={errors.password}
                            >
                                <PasswordInput
                                    id="password"
                                    name="password"
                                    required
                                    autoComplete="new-password"
                                    placeholder={t('auth.choosePassword')}
                                    passwordrules={passwordRules}
                                    aria-invalid={!!errors.password}
                                    className={authInputClass}
                                />
                            </AuthField>

                            {saasEnabled && (
                                <AuthField
                                    id="referral_source"
                                    label={t('auth.referralQuestion')}
                                    aside={
                                        <span className="text-xs text-muted-foreground">
                                            {t('auth.optional')}
                                        </span>
                                    }
                                    error={errors.referral_source}
                                >
                                    <Select name="referral_source">
                                        <SelectTrigger
                                            id="referral_source"
                                            aria-invalid={
                                                !!errors.referral_source
                                            }
                                            // The select's own height wins over `h-11` unless matched on `data-size`.
                                            className="w-full px-4 data-[size=default]:h-11"
                                        >
                                            <SelectValue
                                                placeholder={t(
                                                    'auth.chooseOne',
                                                )}
                                            />
                                        </SelectTrigger>
                                        <SelectContent position="popper">
                                            {referralSources().map((source) => (
                                                <SelectItem
                                                    key={source.value}
                                                    value={source.value}
                                                >
                                                    {source.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </AuthField>
                            )}

                            <AuthSubmit
                                processing={processing}
                                data-test="register-user-button"
                            >
                                {saasEnabled
                                    ? t('common.continue')
                                    : t('auth.createAccount')}
                            </AuthSubmit>
                        </>
                    )}
                </Form>

                <AuthFootnote>
                    {tRich('auth.alreadyHaveAccount', {
                        link: (text) => (
                            <TextLink href={login()}>{text}</TextLink>
                        ),
                    })}
                </AuthFootnote>

                {saasEnabled && (
                    <AuthFootnote className="-mt-2 text-xs">
                        {tRich('auth.acceptTerms', {
                            terms: (text) => (
                                <TextLink
                                    href={terms()}
                                    className="text-muted-foreground"
                                >
                                    {text}
                                </TextLink>
                            ),
                            privacy: (text) => (
                                <TextLink
                                    href={privacy()}
                                    className="text-muted-foreground"
                                >
                                    {text}
                                </TextLink>
                            ),
                        })}
                    </AuthFootnote>
                )}
            </FloatingCard>
        </>
    );
}
