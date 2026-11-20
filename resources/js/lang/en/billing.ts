/** Plan choice, checkout, promotion codes and the legal page chrome. */
export const billing = {
    'billing.paymentStillConfirming': 'Your payment is still being confirmed',
    'billing.paymentStillConfirmingDescription':
        'Some payment methods take a while. Sync starts on its own once it is confirmed; reload this page later to check.',
    'billing.confirmingPayment': 'Confirming your payment…',
    'billing.confirmingPaymentDescription':
        'This page continues on its own once Stripe confirms it.',
    'billing.choosePlanTitle': 'Choose a plan',
    'billing.chooseYourPlan': 'Choose your plan',
    'billing.chooseYourPlanDescription':
        'Sync on every device and a backup on our server.',
    /** Sign-up is the second of two steps (after creating the account). */
    'billing.stepTwoOfTwo': 'Step 2 of 2',
    'billing.plan': 'Plan',
    'billing.lifetime': 'Lifetime',
    'billing.lifetimeNote': 'Pay once, sync forever.',
    'billing.weekly': 'Weekly',
    'billing.weeklyNote': 'Cancel anytime.',
    'billing.perWeek': 'per week',
    /** Screen-reader text before a struck-through price. */
    'billing.regularPrice': 'Regular price:',
    /** Screen-reader text before a struck-through price. */
    'billing.withoutTheCode': 'Without the code:',
    'billing.dueToday': 'Due today, VAT included',
    'billing.continueToPayment': 'Continue to payment',
    'billing.nothingToPay':
        'Nothing to pay and no card needed. Stripe confirms the order.',
    'billing.securePayment':
        'Secure payment with Stripe. No trial, no hidden fees.',
    'billing.notNow':
        'Not now? <logout>Log out and keep using Plain Week for free in this browser.</logout> <export>Export your tasks first</export>.',
    'billing.codeCheckFailed':
        'Could not check the code. Check your connection.',
    'billing.haveCode': 'Have a code?',
    'billing.promotionCode': 'Promotion code',
    'billing.apply': 'Apply',
    /** `{code}` is the promotion code, `{price}` the price with it. */
    'billing.codeApplied': '{code} applied: {price} today.',
    'billing.founderOffer': 'Founder offer',
    'billing.launchOffer': 'Launch offer',
    /** Badge on the plan: "Launch −20%". */
    'billing.launchPercent': 'Launch −{percent}%',
    'billing.launchOfferPercent': '−{percent}% launch offer',
    'billing.legal': 'Legal',
    'billing.termsOfService': 'Terms of Service',
    'billing.privacyPolicy': 'Privacy Policy',
    'billing.lastUpdated': 'Last updated: {date}',
    'billing.checkoutFailed': 'Could not open the checkout. Please try again.',
} as const;
