import { Prisma } from '@prisma/client';
import { DomainError } from './errors';

export function transactionConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw new DomainError('CONFLICT', 'Data changed concurrently; refresh and try again');
  throw error;
}
