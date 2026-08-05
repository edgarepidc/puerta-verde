import Image from 'next/image';
import Link from 'next/link';

import { BRAND_NAME } from '@puertaverde/shared';

const LOGO_SRC = '/brand/logo.png';

interface BrandLogoProps {
  href?: string;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
}

export function BrandLogo({
  href = '/',
  className = '',
  imageClassName = 'h-16 w-auto',
  priority = false,
}: BrandLogoProps) {
  const image = (
    <Image
      src={LOGO_SRC}
      alt={BRAND_NAME}
      width={320}
      height={160}
      priority={priority}
      className={imageClassName}
    />
  );

  if (!href) {
    return <div className={className}>{image}</div>;
  }

  return (
    <Link href={href} className={`inline-flex ${className}`}>
      {image}
    </Link>
  );
}
