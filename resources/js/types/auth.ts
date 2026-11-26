export type User = {
    id: number;
    name: string;
    email: string;
    avatar?: string;
    email_verified_at: string | null;
    two_factor_enabled?: boolean;
    /** The interface language picked in Settings › Preferences; null follows the browser. */
    language?: string | null;
    created_at: string;
    updated_at: string;
    [key: string]: unknown;
};

export type Auth = {
    user: User;
    /** False for an account created through single sign-on that never set a password. */
    hasPassword: boolean;
};

/** Single sign-on through an OpenID Connect IdP (`OIDC_*`). */
export type Oidc = {
    enabled: boolean;
    /** `OIDC_ONLY`: the IdP is the only way in (no password login, sign-up form or reset). */
    only: boolean;
    /** The button text (`OIDC_LABEL`); null shows the translated default. */
    label: string | null;
};

/** SaaS mode (`SAAS_ENABLED`): accounts need a paid plan to sync. */
export type Saas = {
    enabled: boolean;
};

/** Integrations this instance offers; each needs its own credentials. */
export type Integrations = {
    googleCalendar: boolean;
    /** The ICS subscription feed: needs nothing configured, so always true. */
    icsFeed: boolean;
};

/** Web Push on this instance (`VAPID_*` keys); the key is base64url. */
export type Notifications = {
    enabled: boolean;
    vapidPublicKey: string | null;
};

/** The MCP server for AI agents (`MCP_ENABLED`); Settings › Agents & apps shows its MCP part only while it is on. */
export type Mcp = {
    enabled: boolean;
};

export type Plan = 'weekly' | 'lifetime';

/** The signed-in account's entitlement. `hasAccess` is always true when SaaS mode is off. */
export type Account = {
    hasAccess: boolean;
    plan: Plan | null;
};

export type Passkey = {
    id: number;
    name: string;
    authenticator: string | null;
    created_at_diff: string;
    last_used_at_diff: string | null;
};

export type TwoFactorSetupData = {
    svg: string;
    url: string;
};

export type TwoFactorSecretKey = {
    secretKey: string;
};
