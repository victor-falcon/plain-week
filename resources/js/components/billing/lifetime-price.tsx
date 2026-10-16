import type { LifetimeOffer } from '@/components/billing/offers';
import { Badge } from '@/components/ui/badge';

/** The lifetime price, with the regular price struck through during the launch offer. */
export function LifetimePrice({ offer }: { offer: LifetimeOffer }) {
    return (
        <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-tight">
                {offer.price}
            </span>
            {offer.regularPrice && (
                <span className="text-muted-foreground line-through">
                    {offer.regularPrice}
                </span>
            )}
            {offer.discountPercent && (
                <Badge variant="secondary">
                    −{offer.discountPercent}% launch offer
                </Badge>
            )}
        </div>
    );
}
