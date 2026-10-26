import type { Account, Auth, Integrations, Saas } from '@/types/auth';

declare module 'react' {
    interface InputHTMLAttributes<T> {
        passwordrules?: string;
    }
}

declare module '@inertiajs/core' {
    export interface InertiaConfig {
        sharedPageProps: {
            name: string;
            auth: Auth;
            saas: Saas;
            integrations: Integrations;
            account: Account | null;
            sidebarOpen: boolean;
            [key: string]: unknown;
        };
    }
}
