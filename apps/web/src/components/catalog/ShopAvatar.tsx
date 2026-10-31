import Image from 'next/image';
import type { PublicShop } from '@huspee/sdk';

/** Shop logo, or its initials when the shop has none. */
export function ShopAvatar({
  shop,
  className = 'h-11 w-11 text-sm',
}: {
  shop: Pick<PublicShop, 'shop_name' | 'logo_url'>;
  className?: string;
}) {
  const initials = shop.shop_name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft font-bold text-primary ${className}`}
    >
      {shop.logo_url ? (
        <Image
          unoptimized
          width={96}
          height={96}
          src={shop.logo_url}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </span>
  );
}
