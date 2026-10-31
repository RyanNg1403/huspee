-- Existing sessions retain the original buyer/default surface.
CREATE TYPE "WebSessionSurface" AS ENUM ('BUYER', 'SELLER');
ALTER TABLE "web_sessions" ADD COLUMN "surface" "WebSessionSurface" NOT NULL DEFAULT 'BUYER';
