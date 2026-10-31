import Image from 'next/image';

export function Thumb({ src, size = 40 }: { src?: string | null; size?: number }) {
  if (!src)
    return (
      <span
        aria-hidden="true"
        className="shrink-0 rounded-[2px] bg-gray-100"
        style={{ width: size, height: size }}
      />
    );
  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      unoptimized
      className="shrink-0 rounded-[2px] object-cover"
      style={{ width: size, height: size }}
    />
  );
}
