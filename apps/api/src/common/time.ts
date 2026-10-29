/** Shopee timestamps are Unix seconds. */
export function unix(date: Date | null | undefined): number {
  return date ? Math.floor(date.getTime() / 1000) : 0;
}

export function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

export function fromUnix(seconds: number): Date {
  return new Date(seconds * 1000);
}

export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

export function addDays(date: Date, days: number): Date {
  return addSeconds(date, days * 86400);
}
