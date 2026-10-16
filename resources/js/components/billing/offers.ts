/** Prices of the plans as the server formats them from Stripe. */
export type Offers = {
    weekly: { price: string };
    lifetime: LifetimeOffer;
};

export type LifetimeOffer = {
    price: string;
    /** The price before the launch discount, null without a discount. */
    regularPrice: string | null;
    discountPercent: number | null;
};
