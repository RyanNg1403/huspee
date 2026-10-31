# Generated demo catalog images

The built-in **Image Gen** tool generated the product images and shop avatars for the Huspee
demo. These are illustrative renders, not official manufacturer photographs. The full prompt
set, product/shop IDs, filenames and generator provenance are in [manifest.json](manifest.json).

- 80 products across four shops, 20 per shop, with at least two images per product and images
  for every offered color.
- Four distinct shop avatars. Total: 170 images.
- All colors of each multi-color product are generated together in one 2 × 2 sheet and then
  cropped into individual images. The manifest records the shared prompt, group and cell order.
- Alternate views with design or packaging drift were also regenerated together as matched sheets.
  Products that previously had only a hero image receive a matched second camera angle.
  Cropped sheet images are 627 × 627 pixels; other hero photos are up to 1024 × 1024.
- Products: WebP, at most 1024 × 1024 pixels and 200,000 bytes per file.
- Avatars: WebP, at most 512 × 512 pixels and 75,000 bytes per file.
- Original high-resolution PNG renders stay outside the repository. Only optimized assets
  and their prompt manifest are committed; no paid API or image-generation scripts are required
  to seed or run the app.

The seed stores WebP bytes in the existing media table. Content-hashed image IDs ensure that
replacing a file also changes its immutable-cache URL. The storefront's `/credits` page records
the generated provenance. The older `seed-images` directory is retained as a legacy archive;
the seed no longer loads its Wikimedia photos.

`pnpm db:seed` resets all demo state. For an existing database, use `pnpm db:catalog:sync` to add
missing fixtures and refresh fixture-owned images without resetting orders, carts, sessions,
assistant configuration or existing listing prices and stock. Custom uploaded images and shop
avatars are preserved. A fixture ID collision aborts the transaction rather than overwriting
another listing. Run the command with the same database URL and public API URL as the server.
During image generation, `pnpm db:catalog:sync --available-images` publishes only listings whose
assets are complete; the default command requires the entire manifest to be present.

For Docker, rebuild with `HUSPEE_SEED_ON_START=false docker compose up -d --build`, then run
`docker compose exec api pnpm db:catalog:sync`.
