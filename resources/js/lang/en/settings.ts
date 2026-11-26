/** Settings pages and their components. */
export const settings = {
    // Layout
    'settings.layout.title': 'Settings',
    'settings.layout.description': 'Manage your profile and account settings',
    'settings.layout.sendFeedback': 'Send feedback',
    'settings.layout.backToPlanner': 'Back to planner',
    'settings.nav.profile': 'Profile',
    'settings.nav.security': 'Security',
    'settings.nav.appearance': 'Appearance',
    'settings.nav.preferences': 'Preferences',
    'settings.nav.labels': 'Labels',
    'settings.nav.notifications': 'Notifications',
    'settings.nav.integrations': 'Integrations',
    'settings.nav.agents': 'Agents & apps',
    'settings.nav.data': 'Data',
    'settings.nav.billing': 'Billing',

    // Profile
    'settings.profile.title': 'Profile settings',
    'settings.profile.heading': 'Profile',
    'settings.profile.description': 'Update your name and email address',
    'settings.profile.name': 'Name',
    'settings.profile.namePlaceholder': 'Full name',
    'settings.profile.email': 'Email address',
    /** `<resend>` wraps the link that sends the verification email again. */
    'settings.profile.unverified':
        'Your email address is unverified. <resend>Click here to re-send the verification email.</resend>',
    'settings.profile.verificationSent':
        'A new verification link has been sent to your email address.',

    // Delete account
    'settings.deleteUser.title': 'Delete account',
    'settings.deleteUser.description':
        'Delete your account and all of its resources',
    'settings.deleteUser.warning': 'Warning',
    'settings.deleteUser.warningText':
        'Please proceed with caution, this cannot be undone.',
    'settings.deleteUser.button': 'Delete account',
    'settings.deleteUser.dialogTitle':
        'Are you sure you want to delete your account?',
    'settings.deleteUser.dialogDescription':
        'Once your account is deleted, all of its resources and data will also be permanently deleted. Please enter your password to confirm you would like to permanently delete your account.',
    'settings.deleteUser.password': 'Password',
    'settings.deleteUser.dialogDescriptionNoPassword':
        'Once your account is deleted, all of its resources and data will also be permanently deleted.',
    'settings.deleteUser.confirmFirst':
        'Confirm it is you with single sign-on before deleting your account.',

    // Security
    'settings.security.title': 'Security settings',
    'settings.security.passwordTitle': 'Update password',
    'settings.security.passwordDescription':
        'Ensure your account is using a long, random password to stay secure',
    'settings.security.currentPassword': 'Current password',
    'settings.security.newPassword': 'New password',
    'settings.security.confirmPassword': 'Confirm password',
    'settings.security.setPasswordTitle': 'Set a password',
    'settings.security.setPasswordDescription':
        'You log in with single sign-on. Set a password to also log in with your email.',

    // Two-factor authentication
    'settings.twoFactor.title': 'Two-factor authentication',
    'settings.twoFactor.description':
        'Manage your two-factor authentication settings',
    'settings.twoFactor.enabledHint':
        'You will be prompted for a secure, random pin during login, which you can retrieve from the TOTP-supported application on your phone.',
    'settings.twoFactor.disabledHint':
        'When you enable two-factor authentication, you will be prompted for a secure pin during login. This pin can be retrieved from a TOTP-supported application on your phone.',
    'settings.twoFactor.disable': 'Disable 2FA',
    'settings.twoFactor.enable': 'Enable 2FA',
    'settings.twoFactor.continueSetup': 'Continue setup',
    'settings.twoFactor.recoveryTitle': '2FA recovery codes',
    'settings.twoFactor.recoveryDescription':
        'Recovery codes let you regain access if you lose your 2FA device. Store them in a secure password manager.',
    'settings.twoFactor.viewCodes': 'View recovery codes',
    'settings.twoFactor.hideCodes': 'Hide recovery codes',
    'settings.twoFactor.regenerate': 'Regenerate codes',
    'settings.twoFactor.codesLabel': 'Recovery codes',
    'settings.twoFactor.codesLoading': 'Loading recovery codes',
    /** `<strong>` wraps the name of the "Regenerate codes" button. */
    'settings.twoFactor.codesWarning':
        'Each recovery code can be used once to access your account and will be removed after use. If you need more, click <strong>Regenerate codes</strong> above.',
    'settings.twoFactor.enabledTitle': 'Two-factor authentication enabled',
    'settings.twoFactor.enabledDescription':
        'Two-factor authentication is now enabled. Scan the QR code or enter the setup key in your authenticator app.',
    'settings.twoFactor.verifyTitle': 'Verify authentication code',
    'settings.twoFactor.verifyDescription':
        'Enter the 6-digit code from your authenticator app',
    'settings.twoFactor.setupTitle': 'Enable two-factor authentication',
    'settings.twoFactor.setupDescription':
        'To finish enabling two-factor authentication, scan the QR code or enter the setup key in your authenticator app',
    'settings.twoFactor.manualEntry': 'or, enter the code manually',
    'settings.twoFactor.confirm': 'Confirm',
    'settings.twoFactor.qrFailed': 'Failed to fetch QR code',
    'settings.twoFactor.keyFailed': 'Failed to fetch a setup key',
    'settings.twoFactor.codesFailed': 'Failed to fetch recovery codes',

    // Passkeys
    'settings.passkeys.title': 'Passkeys',
    'settings.passkeys.description':
        'Manage your passkeys for passwordless sign-in',
    'settings.passkeys.emptyTitle': 'No passkeys yet',
    'settings.passkeys.emptyDescription':
        'Add a passkey to sign in without a password',
    /** `{time}` is a relative time such as "3 days ago". */
    'settings.passkeys.added': 'Added {time}',
    'settings.passkeys.lastUsed': 'Last used {time}',
    /** Screen reader text of the trash button. */
    'settings.passkeys.remove': 'Remove',
    'settings.passkeys.removeTitle': 'Remove passkey',
    'settings.passkeys.removeDescription':
        'Are you sure you want to remove the "{name}" passkey? You will no longer be able to use it to sign in.',
    'settings.passkeys.removing': 'Removing...',
    'settings.passkeys.unsupported':
        'Passkeys are not supported in this browser.',
    'settings.passkeys.add': 'Add passkey',
    'settings.passkeys.nameLabel': 'Passkey name',
    'settings.passkeys.namePlaceholder': 'e.g., MacBook Pro, iPhone',
    'settings.passkeys.nameHint':
        'A name helps you identify this passkey later.',
    'settings.passkeys.register': 'Register passkey',
    'settings.passkeys.registering': 'Registering...',
    /** The suggested name of a new passkey: "Chrome on Mac". */
    'settings.passkeys.defaultName': '{browser} on {os}',
    'settings.passkeys.signIn': 'Sign in with a passkey',
    'settings.passkeys.authenticating': 'Authenticating...',
    'settings.passkeys.orEmail': 'Or continue with email',

    // Appearance
    'settings.appearance.title': 'Appearance settings',
    'settings.appearance.description':
        'Update the appearance settings for your account',
    'settings.appearance.light': 'Light',
    'settings.appearance.dark': 'Dark',
    'settings.appearance.system': 'System',

    // Notifications
    'settings.notifications.title': 'Notifications',
    'settings.notifications.description': 'Reminders for the tasks you plan',
    'settings.notifications.explanation':
        "Every morning you get one notification with the day's tasks that have no time and aren't done yet. Tasks with a time get one 5 minutes before they start instead. Opening a notification opens its task, or the planner when it lists several.",
    'settings.notifications.needsInstallTitle':
        'Add Plain Week to your Home Screen',
    'settings.notifications.needsInstall':
        'On iPhone and iPad, notifications only work in the app added to the Home Screen (iOS 16.4 or later). In Safari, tap Share, then Add to Home Screen, open Plain Week from there and turn notifications on.',
    'settings.notifications.unsupportedTitle': 'Not available in this browser',
    'settings.notifications.unsupported':
        "This browser can't receive notifications from Plain Week. Recent versions of Chrome, Edge, Firefox and Safari can.",
    'settings.notifications.deniedTitle': 'Notifications are blocked',
    'settings.notifications.denied':
        'This browser blocks notifications from Plain Week. Allow them in its settings for this site (usually behind the icon next to the address), then come back here and turn them on.',
    'settings.notifications.turnedOn': 'Notifications are on for this device.',
    'settings.notifications.turnedOff':
        'Notifications are off for this device.',
    'settings.notifications.stayOff':
        'Notifications stay off: allow them when the browser asks.',
    'settings.notifications.turnOffFailed':
        'Could not turn off notifications. Try again.',
    'settings.notifications.turnOnFailed':
        'Could not turn on notifications. Reload the page and try again.',
    'settings.notifications.offline':
        "You're offline. Turn notifications on once you're back online.",
    'settings.notifications.deviceLabel': 'Notifications on this device',
    'settings.notifications.deviceHint':
        'Turn them on on each phone or computer where you want them. Signing out turns them off here.',
    'settings.notifications.morningLabel': 'Morning notifications',
    /** `{timezone}` is an IANA name such as "Europe/Madrid". */
    'settings.notifications.timezone':
        'In your time zone, {timezone}, taken from the last device that synced.',
    'settings.notifications.timezoneUnknown':
        'In your time zone once one of your devices has synced. Until then, in the time zone of this Plain Week server.',

    // Integrations
    'settings.integrations.title': 'Integrations',
    'settings.integrations.description': 'Connect Plain Week to other services',
    'settings.integrations.needsReconnecting': 'Needs reconnecting',
    'settings.integrations.googleDescription':
        'Show your planned tasks in a “Plain Week” calendar in your Google account. Changes go one way: edit tasks here, not in Google.',
    'settings.integrations.googleBroken':
        "Google stopped accepting Plain Week's access to {email}. Reconnect to keep your calendar up to date.",
    'settings.integrations.googleConnected':
        'Connected to {email}. Your planned tasks show up in its “Plain Week” calendar.',
    'settings.integrations.connect': 'Connect',
    'settings.integrations.reconnect': 'Reconnect',
    'settings.integrations.disconnect': 'Disconnect',
    'settings.integrations.disconnectTitle': 'Disconnect Google Calendar?',
    'settings.integrations.disconnectBroken':
        "Plain Week can no longer reach {email}, so its “Plain Week” calendar stays there: delete it in Google Calendar if you don't need it. Your tasks stay in Plain Week.",
    'settings.integrations.disconnectDescription':
        'The “Plain Week” calendar is deleted from {email}. Your tasks stay in Plain Week.',
    'settings.integrations.waiting': 'Waiting for the first sync.',
    /** `<when>` wraps the relative time ("5 minutes ago"), which is `{time}`. */
    'settings.integrations.lastSynced': 'Last synced <when>{time}</when>.',
    'settings.integrations.syncProblem': 'The last sync had a problem',
    'settings.integrations.ics.title': 'Calendar feed',
    'settings.integrations.ics.description':
        'Subscribe to your planned tasks from Apple Calendar, iCloud, Outlook or any calendar app. It is read-only: edit tasks here. Calendar apps refresh it every 15 minutes to a few hours, depending on the app.',
    'settings.integrations.ics.enabled':
        'Add this URL to your calendar app as a subscription. Calendar apps refresh it every 15 minutes to a few hours, depending on the app.',
    /** `<plan>` wraps the link to the plans page. */
    'settings.integrations.ics.needsPlan':
        'The calendar feed needs a paid plan: <plan>choose a plan</plan> to turn it on.',
    'settings.integrations.ics.enable': 'Enable',
    'settings.integrations.ics.urlLabel': 'Calendar feed URL',
    'settings.integrations.ics.copied': 'URL copied',
    'settings.integrations.ics.open': 'Open in Calendar app',
    'settings.integrations.ics.private':
        'Keep this link private: anyone with it can see your tasks and notes.',
    'settings.integrations.ics.pausedTitle': 'Your calendars stopped updating',
    /** `<plan>` wraps the link to the plans page. */
    'settings.integrations.ics.paused':
        'The calendar feed needs a paid plan. <plan>Choose a plan</plan> to get updates again, or disable it.',
    'settings.integrations.ics.howTo': 'How to subscribe',
    /** `<b>` wraps the app name and the menu path. */
    'settings.integrations.ics.howToApple':
        '<b>Apple Calendar</b> (Mac): File › New Calendar Subscription, or use “Open in Calendar app”.',
    'settings.integrations.ics.howToIcloud':
        '<b>iCloud</b> (web): next to Calendars, click + › Add Subscribed Calendar.',
    'settings.integrations.ics.howToOutlook':
        '<b>Outlook</b>: Add calendar › Subscribe from web.',
    'settings.integrations.ics.howToGoogle':
        '<b>Google Calendar</b>: Other calendars › + › From URL.',
    'settings.integrations.ics.regenerate': 'Regenerate URL',
    'settings.integrations.ics.regenerateTitle': 'Make a new URL?',
    'settings.integrations.ics.regenerateDescription':
        'The current URL stops working at once: calendars subscribed to it stop updating, and you need to subscribe again with the new one.',
    'settings.integrations.ics.disable': 'Disable',
    'settings.integrations.ics.disableTitle': 'Disable the calendar feed?',
    'settings.integrations.ics.disableDescription':
        'The URL stops working at once and calendars subscribed to it stop updating. Remove the subscription from your calendar apps. Your tasks stay in Plain Week.',

    // Agents
    'settings.agents.title': 'Agents & apps',
    'settings.agents.description':
        'Let AI agents like Claude and apps read and plan your week',
    /** Shown while the instance has the MCP server off. */
    'settings.agents.descriptionApiOnly': 'Let apps read and plan your week',
    'settings.agents.needsPlanTitle': 'Agents and apps need a paid plan',
    'settings.agents.needsPlanTitleApiOnly': 'Apps need a paid plan',
    /** `<plan>` wraps the link to the plans page. */
    'settings.agents.needsPlan':
        'You can set up a connection now; agents and apps can use your planner once you <plan>choose a plan</plan>.',
    'settings.agents.needsPlanApiOnly':
        'You can set up a connection now; apps can use your planner once you <plan>choose a plan</plan>.',
    'settings.agents.url.title': 'MCP server URL',
    'settings.agents.url.description':
        'Plain Week is an MCP server: add this URL to any agent that supports remote MCP servers.',
    'settings.agents.url.copy': 'Copy URL',
    'settings.agents.copy': 'Copy',
    'settings.agents.copied': 'Copied',
    'settings.agents.copyFailed':
        'Could not copy. Select the text and copy it instead.',
    /** `<when>` wraps the relative time ("3 days ago"), which is `{time}`. */
    'settings.agents.created': 'Created <when>{time}</when>',
    'settings.agents.connected': 'Connected <when>{time}</when>',
    'settings.agents.lastUsed': 'Last used <when>{time}</when>',
    'settings.agents.neverUsed': 'Never used',
    'settings.agents.setup.title': 'Connect an agent or app',
    'settings.agents.setup.description':
        'Agents and apps get the same access to your planner as you: they can read, add, change and delete tasks.',
    'settings.agents.setup.titleApps': 'Connect an app',
    'settings.agents.setup.descriptionApps':
        'Apps get the same access to your planner as you: they can read, add, change and delete tasks.',
    'settings.agents.setup.appsTab': 'Apps',
    'settings.agents.setup.otherClients': 'Other clients',
    /** `<strong>` wraps the name of a button in the Claude app. */
    'settings.agents.setup.claudeStep1':
        'In claude.ai or Claude Desktop, open Settings › Connectors and choose <strong>Add custom connector</strong>.',
    'settings.agents.setup.claudeStep2':
        'Name it “Plain Week” and paste the MCP server URL above.',
    'settings.agents.setup.claudeStep3':
        'Choose Connect, then Approve in the Plain Week window that opens. No token is needed.',
    'settings.agents.setup.claudeCodeIntro':
        'Create a personal token below, then run:',
    'settings.agents.setup.copyCommand': 'Copy command',
    'settings.agents.setup.otherIntro':
        'For clients that support remote MCP servers (Streamable HTTP). Those that support OAuth only need the URL; the others send a personal token:',
    'settings.agents.setup.copyConfiguration': 'Copy configuration',
    'settings.agents.tokens.title': 'Personal tokens',
    'settings.agents.tokens.description':
        'For agents and apps that send a token instead of signing in. Keep it secret: it gives full access to your planner until you revoke it.',
    'settings.agents.tokens.newTokenTitle': 'Copy the token for “{name}” now',
    'settings.agents.tokens.newTokenHint': "You won't be able to see it again.",
    'settings.agents.tokens.copy': 'Copy token',
    'settings.agents.tokens.new': 'New token',
    'settings.agents.tokens.placeholder': 'e.g. Claude Code on my laptop',
    'settings.agents.tokens.create': 'Create',
    'settings.agents.tokens.empty': 'No personal tokens yet.',
    'settings.agents.tokens.revoke': 'Revoke',
    'settings.agents.tokens.revokeTitle': 'Revoke “{name}”?',
    'settings.agents.tokens.revokeDescription':
        "Agents and apps using this token lose access to your planner at once. This can't be undone.",
    'settings.agents.apps.title': 'Connected apps',
    'settings.agents.apps.description':
        'Agents and apps you approved when they asked to connect to Plain Week.',
    'settings.agents.apps.setup.signIn':
        "In a Plain Week app, choose Sign in and approve it in the window that opens; no token is needed. Apps that can't sign in take a personal token instead.",
    'settings.agents.apps.setup.building':
        'Building your own? Apps sync through the app API, signing in with OAuth (authorization code with PKCE) or sending a personal token as a Bearer header.',
    'settings.agents.apps.setup.baseUrl': 'API base URL',
    'settings.agents.apps.setup.copyApiUrl': 'Copy API URL',
    'settings.agents.apps.setup.header': 'Header',
    'settings.agents.apps.setup.copyHeader': 'Copy header',
    'settings.agents.apps.setup.tryIt': 'Try it',
    'settings.agents.apps.setup.metadata': 'OAuth server metadata',
    'settings.agents.apps.setup.copyMetadataUrl': 'Copy metadata URL',
    /** `<code>` wraps a URL scheme, shown as code. */
    'settings.agents.apps.setup.metadataHint':
        'Lists the authorization, token and registration endpoints. Apps register themselves and redirect to a loopback address or a <code>plainweek://</code> URL.',
    'settings.agents.apps.empty': 'No apps connected yet.',
    'settings.agents.apps.disconnect': 'Disconnect',
    'settings.agents.apps.disconnectTitle': 'Disconnect {name}?',
    'settings.agents.apps.disconnectDescription':
        '{name} loses access to your planner at once. To use it again, connect it again and approve it.',
    'settings.agents.activity.title': 'Activity',
    'settings.agents.activity.description':
        'What agents changed in your planner over the last 90 days. To undo a change, ask the agent or edit the task in the planner.',
    'settings.agents.activity.empty': 'No changes by agents yet.',
    'settings.agents.activity.clientToken': 'Personal token',
    'settings.agents.activity.clientOauth': 'Connected app',
    'settings.agents.activity.pages': 'Activity pages',
    'settings.agents.activity.newer': 'Newer',
    'settings.agents.activity.older': 'Older',

    // Billing
    'settings.billing.title': 'Billing',
    'settings.billing.description': 'Your plan, payment method and invoices',
    'settings.billing.lifetime': 'Lifetime',
    'settings.billing.lifetimeSince':
        'Yours since {date}. Sync is included for good.',
    'settings.billing.lifetimeDescription': 'Sync is included for good.',
    'settings.billing.paymentFailed': 'Weekly: payment failed',
    'settings.billing.paymentFailedDescription':
        'Update your payment method to keep syncing. Your tasks stay on this device meanwhile.',
    'settings.billing.weekly': 'Weekly',
    'settings.billing.cancelled': 'Cancelled. Sync keeps working until {date}.',
    'settings.billing.renewsOn': 'Renews on {date}.',
    'settings.billing.renewsWeekly': 'Renews every week.',
    'settings.billing.noPlan': 'No plan',
    'settings.billing.noPlanDescription':
        'Choose a plan to sync your tasks across your devices.',
    'settings.billing.choosePlan': 'Choose a plan',
    'settings.billing.invoices': 'Invoices',
    'settings.billing.manage': 'Manage subscription',
    'settings.billing.upgrade': 'Upgrade to lifetime',
    'settings.billing.upgradeDescription':
        'Pay once and stop paying every week. Your weekly subscription ends with the period you already paid for.',

    // Data (export and import)
    'settings.data.title': 'Data settings',
    'settings.data.export.title': 'Export data',
    'settings.data.export.description':
        'Download all your tasks, recurring ones included, as a JSON file. Keep it as a backup or move your planner to another Plain Week instance.',
    'settings.data.export.button': 'Export data',
    'settings.data.import.title': 'Import data',
    'settings.data.import.description':
        'Add the tasks of an export file to your planner. Your existing tasks stay unchanged; importing the same file twice adds its tasks twice.',
    'settings.data.import.button': 'Import data…',
    'settings.data.format.title': 'File format',
    /** The file name pattern is literal: keep it as is. */
    'settings.data.format.description':
        'A plain-week-export-YYYY-MM-DD.json file with a format marker, a version and the list of tasks: text, date or Someday column, position, done state, color, time, notes, subtasks and repeat rules. Deleted tasks are left out.',
    /** `{formatted}` is `{count}` formatted for the language. */
    'settings.data.tasks': {
        one: '{formatted} task',
        other: '{formatted} tasks',
    },
    /** `{tasks}` is a count such as "12 tasks". */
    'settings.data.preview':
        '{tasks} will be added. Your existing tasks will stay unchanged.',
    'settings.data.previewRecurring':
        '{tasks} ({recurring} recurring) will be added. Your existing tasks will stay unchanged.',
    'settings.data.importing': 'Importing {tasks}…',
    'settings.data.importingButton': 'Importing…',
    'settings.data.importButton': 'Import',
    'settings.data.progress': 'Import progress',
    'settings.data.exported': 'Exported {tasks}',
    'settings.data.exportedNotSynced':
        'Not synced with your account right now, so changes made on other devices may be missing.',
    'settings.data.imported': 'Imported {tasks}',
    'settings.data.nothingToExport': 'There are no tasks to export.',
    'settings.data.nothingInFile': 'There are no tasks in this file.',
    'settings.data.exportFailed': 'Could not export your data.',
    'settings.data.readFailed': 'Could not read this file.',
    'settings.data.importFailed': 'Could not import this file.',
    'settings.data.importStopped':
        'The import stopped after {written} of {total} tasks; those were added.',

    // Import file errors. A row error reads: Task 3: "color" must be one of …
    'settings.transfer.tooLarge':
        'This file is too large to import (more than {size} MB).',
    'settings.transfer.notJson': 'This file is not valid JSON.',
    'settings.transfer.notExport': 'This is not a Plain Week export file.',
    'settings.transfer.newerVersion':
        'This file comes from a newer version of Plain Week (format version {version}). Update Plain Week to import it.',
    'settings.transfer.unsupportedVersion':
        'Unsupported export format version: {version}.',
    'settings.transfer.noTaskList': 'This file has no task list.',
    /** Names the row of an import error; `{number}` counts from 1. */
    'settings.transfer.task': 'Task {number}',
    'settings.transfer.notObject': '{label} is not an object.',
    /** `{field}` is a field of the file (leave it as is); `{rule}` is one of the `settings.transfer.rule.*` messages. */
    'settings.transfer.fieldError': '{label}: "{field}" {rule}.',
    'settings.transfer.rule.duplicateId': 'is used by another task in the file',
    'settings.transfer.rule.missing': 'is missing',
    'settings.transfer.rule.string': 'must be a string',
    'settings.transfer.rule.notEmpty': 'cannot be empty',
    'settings.transfer.rule.boolean': 'must be true or false',
    'settings.transfer.rule.timestamp':
        'must be a timestamp like 2026-10-15T08:35:00.123Z',
    'settings.transfer.rule.timestampOrNull': 'must be a timestamp or null',
    'settings.transfer.rule.list': 'must be a list',
    'settings.transfer.rule.object': 'must be an object',
    'settings.transfer.rule.objectOrNull': 'must be an object or null',
    'settings.transfer.rule.subtaskId':
        'must be a string of 1 to {max} characters',
    'settings.transfer.rule.unknownKey': 'has an unknown key "{key}"',
    'settings.transfer.rule.dateOrNull':
        'must be a date like 2026-10-15 or null',
    'settings.transfer.rule.every': 'must be a number of days from 1 to {max}',
    'settings.transfer.rule.weekdays':
        'must be a sorted list of unique weekdays from 1 to 7',
    'settings.transfer.rule.dayOfMonth':
        'must be a day of the month from 1 to 31',
    'settings.transfer.rule.recurrenceType':
        'must be "daily", "weekly" or "monthly"',
    'settings.transfer.rule.somedayColumn': 'must be 0, 1, 2 or null',
    'settings.transfer.rule.somedayRequired': 'is required when "date" is null',
    'settings.transfer.rule.positionMax': 'must be at most {max} characters',
    'settings.transfer.rule.colorOneOf': 'must be one of {colors}',
    'settings.transfer.rule.taskIdOrNull': 'must be a task id or null',
    'settings.transfer.rule.selfSeries': 'cannot be the task itself',
    'settings.transfer.rule.dateRequired': 'is required for a recurring task',
    'settings.transfer.rule.exceptionRecurrence':
        'cannot be set on an exception of a series',
    'settings.transfer.rule.untilBefore': 'cannot be before the task date',
    'settings.transfer.rule.exceptionRequired':
        'is required on an exception of a series',
    'settings.transfer.rule.timeOrNull': 'must be a time like 09:30 or null',

    // Relative times
    'settings.relativeTime.now': 'just now',
} as const;
