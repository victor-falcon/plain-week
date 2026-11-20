import { Head, usePage } from '@inertiajs/react';
import { FileDown, FileUp } from 'lucide-react';
import { useDataTransfer } from '@/components/data-transfer';
import Heading from '@/components/heading';
import { SyncProvider } from '@/components/sync-provider';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { t } from '@/lib/i18n';
import { prepareLocalData } from '@/lib/sync';

/**
 * Settings › Data: export and import a JSON backup. The page comes from the
 * server, but both actions run in the browser against IndexedDB (they work
 * offline once the page is loaded); imported tasks sync like any other
 * change.
 */
export default function Data() {
    const { auth } = usePage().props;
    const userId = auth.user.id;
    const transfer = useDataTransfer({
        prepare: () => prepareLocalData(userId),
    });

    return (
        <SyncProvider>
            <Head title={t('settings.data.title')} />

            <h1 className="sr-only">{t('settings.data.title')}</h1>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title={t('settings.data.export.title')}
                    description={t('settings.data.export.description')}
                />
                <Button
                    onClick={transfer.exportData}
                    disabled={transfer.exporting}
                    data-test="export-data"
                >
                    {transfer.exporting ? <Spinner /> : <FileDown />}
                    {t('settings.data.export.button')}
                </Button>
            </div>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title={t('settings.data.import.title')}
                    description={t('settings.data.import.description')}
                />
                <Button
                    variant="outline"
                    onClick={transfer.chooseImportFile}
                    disabled={transfer.reading}
                    data-test="import-data"
                >
                    {transfer.reading ? <Spinner /> : <FileUp />}
                    {t('settings.data.import.button')}
                </Button>
                {transfer.element}
            </div>

            <Heading
                variant="small"
                title={t('settings.data.format.title')}
                description={t('settings.data.format.description')}
            />
        </SyncProvider>
    );
}
