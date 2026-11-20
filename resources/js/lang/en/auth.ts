/** Log in, sign up, password reset, two-factor and the OAuth consent card. */
export const auth = {
    'auth.logIn': 'Log in',
    'auth.logOut': 'Log out',
    'auth.welcomeBack': 'Welcome back',
    'auth.logInDescription': 'Log in to sync your week.',
    'auth.email': 'Email',
    'auth.emailPlaceholder': 'you@example.com',
    'auth.password': 'Password',
    'auth.passwordPlaceholder': 'Your password',
    'auth.forgotIt': 'Forgot it?',
    'auth.rememberMe': 'Remember me',
    'auth.noAccountSyncWeek': 'No account yet? <link>Sync your week</link>',
    'auth.noAccountSignUp': 'No account yet? <link>Sign up</link>',
    'auth.forgotPasswordTitle': 'Forgot password',
    'auth.forgotYourPassword': 'Forgot your password?',
    'auth.forgotPasswordDescription':
        "Enter your email and we'll send you a link to choose a new one.",
    'auth.emailResetLink': 'Email reset link',
    'auth.rememberedIt': 'Remembered it? <link>Log in</link>',
    'auth.emailVerification': 'Email verification',
    'auth.checkYourEmail': 'Check your email',
    'auth.checkYourEmailDescription':
        'Click the link we just emailed you to verify your address.',
    'auth.verificationLinkSent':
        'A new verification link has been sent to the email address you signed up with.',
    'auth.resendVerification': 'Resend verification email',
    'auth.confirmPassword': 'Confirm password',
    'auth.confirmYourPassword': 'Confirm your password',
    'auth.confirmPasswordDescription':
        'This is a secure area. Confirm your password before continuing.',
    'auth.confirmWithPasskey': 'Confirm with passkey',
    'auth.confirming': 'Confirming...',
    'auth.orConfirmWithPassword': 'Or confirm with password',
    'auth.resetPassword': 'Reset password',
    'auth.chooseNewPassword': 'Choose a new password',
    'auth.resetPasswordDescription': 'Then log in with it on every device.',
    'auth.newPassword': 'New password',
    'auth.repeatPassword': 'Repeat it',
    'auth.twoFactorTitle': 'Two-factor authentication',
    'auth.recoveryCode': 'Recovery code',
    'auth.authenticationCode': 'Authentication code',
    'auth.recoveryCodeDescription':
        'Confirm access to your account with one of your emergency recovery codes.',
    'auth.authenticationCodeDescription':
        'Enter the code from your authenticator app.',
    'auth.enterRecoveryCode': 'Enter recovery code',
    'auth.useAuthenticationCode': 'Use an authentication code',
    'auth.useRecoveryCode': 'Use a recovery code',
    'auth.register': 'Register',
    'auth.createYourAccount': 'Create your account',
    'auth.registerDescriptionSaas':
        'Then choose how to pay. Your tasks on this device come with you.',
    'auth.registerDescription': 'Your tasks on this device come with you.',
    /** Sign-up is the first of two steps (then the plan choice). */
    'auth.stepOfTwo': 'Step 1 of 2',
    'auth.name': 'Name',
    'auth.namePlaceholder': 'Your name',
    'auth.choosePassword': 'Choose a password',
    'auth.referralQuestion': 'How did you hear about Plain Week?',
    'auth.optional': 'Optional',
    'auth.chooseOne': 'Choose one',
    'auth.referralX': 'X (Twitter)',
    'auth.referralSubstack': 'Substack newsletter',
    'auth.referralReddit': 'Reddit',
    'auth.referralHackerNews': 'Hacker News',
    'auth.referralFriend': 'A friend',
    'auth.referralOther': 'Other',
    'auth.createAccount': 'Create account',
    'auth.alreadyHaveAccount': 'Already have an account? <link>Log in</link>',
    'auth.acceptTerms':
        'By continuing you accept the <terms>Terms</terms> and <privacy>Privacy</privacy>.',
    'auth.connectAnApp': 'Connect an app',
    /** `{client}` is the name of the app (an AI agent) asking for access. */
    'auth.connectTitle': 'Connect {client} to Plain Week?',
    'auth.connectDescription':
        '{client} will be able to see, add, change and delete the tasks in your planner, as {email}.',
    /** `{host}` is the site the browser returns to after approving. */
    'auth.approvingSendsYouBack':
        'Approving sends you back to <host>{host}</host>. Only approve if that is the app you are connecting.',
    'auth.approve': 'Approve',
    'auth.deny': 'Deny',
    'auth.disconnectAnytime':
        'You can disconnect it at any time in Settings › Agents & apps.',
    'auth.hidePassword': 'Hide password',
    'auth.showPassword': 'Show password',
    'auth.logOutUnsynced': {
        one: '{count} change has not been synced yet and will be lost. Log out anyway?',
        other: '{count} changes have not been synced yet and will be lost. Log out anyway?',
    },
    'auth.logOutFailed': 'Could not log out. Check your connection.',
} as const;
