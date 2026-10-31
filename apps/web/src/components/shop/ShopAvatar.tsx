'use client';
import Image from 'next/image';
import type { PublicShop } from '@huspee/sdk';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');

export function ShopAvatar({
  shop,
  className,
}: {
  shop: Pick<PublicShop, 'shop_name' | 'logo_url'>;
  className: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-link font-bold text-white ${className}`}
    >
      {shop.logo_url ? (
        <Image
          unoptimized
          width={128}
          height={128}
          src={shop.logo_url}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        initials(shop.shop_name)
      )}
    </span>
  );
}

export function OfficialBadge({ label, className = '' }: { label: string; className?: string }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-sm bg-primary px-1.5 text-[11px] leading-[18px] font-semibold text-white ${className}`}
    >
      {label}
    </span>
  );
}
