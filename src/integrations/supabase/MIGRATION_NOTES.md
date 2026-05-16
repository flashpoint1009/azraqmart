# Phase 5 Migration Catalog — Direct `supabase` Consumers

> Source: task 5.1 in `.kiro/specs/white-label-saas-system/tasks.md`
> Validates: Requirements 1.2, 11.6
> Companion module: [`scoped-client.ts`](./scoped-client.ts)

This document inventories every place in `src/` that talks to Supabase
without going through `useTenantScopedSupabase()` /
`withScopedSupabase()`. Phase 5 of the migration in `design.md`
(§"Migration Path from Single-Tenant azraqmart") is to route each of
these through the scope shim before strict deny-by-default RLS is
flipped on in task 7.1.

The catalog is intentionally scoped to **`src/`** (the application).
Generated types under `src/integrations/supabase/types.ts` and the
`client.ts` proxy itself are out of scope — they are foundational and
must continue to expose the un-scoped client for the shim to wrap.

## Why a catalog instead of a one-shot refactor

Phase 3 RLS is in **shadow mode** — denied queries are logged to
`rls_shadow_log`, not blocked. So:

- Existing direct `supabase.from(...)` call sites keep working today.
- Refactoring all ~140 call sites in a single PR would be unreviewable
  and high-risk; it would also touch unrelated concerns (TanStack Query
  keys, transaction sequencing, error handling).
- The safe migration order is: introduce the shim → migrate sites in
  reviewable batches → review `rls_shadow_log` → flip strict RLS in
  task 7.1.

This catalog is the **input** to that batched migration. Each row
records the file, line number, and table being queried so a reviewer
can plan migration batches per table or per route.

## Migration recipe per call site

1. Locate the component / hook / route in this catalog.
2. If it is a client component reachable from `<TenantProvider>`,
   replace the top-level `import { supabase } from
   "@/integrations/supabase/client"` with `import {
   useTenantScopedSupabase } from
   "@/integrations/supabase/scoped-client"` and bind a
   `runScoped = useTenantScopedSupabase()` inside the component.
3. If it is a server function / loader, use `withScopedSupabase(tenantId,
   ...)` with the tenant id supplied by the resolver context.
4. Wrap each `supabase.from(...)` block in `runScoped(async (scoped)
   => ...)` and rename `supabase` → `scoped` inside the block.
5. Remove the now-unused top-level `supabase` import if nothing else
   references it.
6. Verify against `rls_shadow_log` after deploy that the corresponding
   table/route no longer appears as un-scoped.

## Reference example

`src/components/DBBrowser.tsx` was migrated as part of task 5.1 and
serves as the canonical reference. It demonstrates:

- Calling `useTenantScopedSupabase()` once at the top of the component.
- Routing every `useQuery` / `useMutation` body through `runScoped`.
- Keeping all existing UI and TanStack Query keys verbatim.

## Inventory

### `src/components/`

| File | Line | Operation | Table / target |
| --- | --- | --- | --- |
| `ChatWidget.tsx` | 115 | insert | `chat_messages` |
| `CustomerDrawer.tsx` | 72 | select | `profiles` |
| `DBBrowser.tsx` | 32 | select | dynamic (whitelist) — **migrated** |
| `DBBrowser.tsx` | 48 | update | dynamic (whitelist) — **migrated** |
| `DBBrowser.tsx` | 61 | delete | dynamic (whitelist) — **migrated** |
| `DemoSeeder.tsx` | 89 | select (count) | `products` |
| `DemoSeeder.tsx` | 90 | select (count) | `categories` |
| `DemoSeeder.tsx` | 91 | select (count) | `customers` |
| `DemoSeeder.tsx` | 92 | select (count) | `orders` |
| `DemoSeeder.tsx` | 105 | select | `categories` |
| `DemoSeeder.tsx` | 108 | insert | `categories` |
| `DemoSeeder.tsx` | 116 | select | `categories` |
| `DemoSeeder.tsx` | 118 | insert | `categories` |
| `DemoSeeder.tsx` | 142 | upsert | `products` |
| `DemoSeeder.tsx` | 145 | select | `products` |
| `DemoSeeder.tsx` | 157 | insert | `customers` |
| `DemoSeeder.tsx` | 165 | select | `products` |
| `DemoSeeder.tsx` | 190 | insert | `orders` |
| `DemoSeeder.tsx` | 208 | insert | `order_items` |
| `DemoSeeder.tsx` | 220 | select | `coupons` |
| `DemoSeeder.tsx` | 221 | insert | `coupons` |
| `DemoSeeder.tsx` | 243 | select | `orders` |
| `DemoSeeder.tsx` | 246 | delete | `order_items` |
| `DemoSeeder.tsx` | 247 | delete | `orders` |
| `DemoSeeder.tsx` | 251 | delete | `products` |
| `DemoSeeder.tsx` | 254 | delete | `customers` |
| `DemoSeeder.tsx` | 257 | delete | `coupons` |
| `LicenseManager.tsx` | 43 | select | `licenses` |
| `LicenseManager.tsx` | 53 | update | `licenses` |
| `LicenseManager.tsx` | 54 | insert | `licenses` |
| `LicenseManager.tsx` | 68 | delete | `licenses` |
| `PushNotificationsPanel.tsx` | 40 | select (count) | `user_push_tokens` |
| `PushNotificationsPanel.tsx` | 41 | select (count) | `notifications` |
| `PushNotificationsPanel.tsx` | 66 | insert | `notifications` |
| `UsersManager.tsx` | 80 | select | `user_permissions` |
| `UsersManager.tsx` | 88 | insert | `user_roles` |
| `UsersManager.tsx` | 91 | delete | `user_roles` |
| `UsersManager.tsx` | 118 | update | `profiles` |
| `WelcomeMessage.tsx` | 47 | upsert | `welcome_dismissals` |
| `AssignDeliveryDialog.tsx` | 91 | rpc | `assign_order_to_delivery` |
| `ImageUpload.tsx` | 27 | storage upload | `app-assets` |
| `ImageUpload.tsx` | 32 | storage getPublicUrl | `app-assets` |

### `src/hooks/`

| File | Line | Operation | Table / target |
| --- | --- | --- | --- |
| `useAboutSection.tsx` | 25 | select | `about_section` |
| `useHomeBanners.tsx` | 19 | select | `home_banners` |
| `useNotifications.tsx` | 54 | update | `notifications` |
| `usePushNotifications.tsx` | 35 | upsert | `user_push_tokens` |

### `src/routes/`

| File | Line | Operation | Table / target |
| --- | --- | --- | --- |
| `account.tsx` | 88 | update | `customers` |
| `account.tsx` | 91 | insert | `customers` |
| `accounting.tsx` | 75 | select | `products` |
| `accounting.tsx` | 84 | update | `products` |
| `accounting.tsx` | 87 | insert | `products` |
| `accounting.tsx` | 102 | delete | `products` |
| `accounting.tsx` | 170 | select | `purchase_invoices` |
| `accounting.tsx` | 178 | insert | `purchase_invoices` |
| `accounting.tsx` | 182 | insert | `cash_transactions` |
| `accounting.tsx` | 241 | select | `cash_transactions` |
| `accounting.tsx` | 251 | insert | `cash_transactions` |
| `accounting.tsx` | 315 | select | `user_roles` |
| `accounting.tsx` | 358 | insert | `cash_transactions` |
| `accounting.tsx` | 454 | select | `orders` |
| `accounting.tsx` | 455 | select | `purchase_invoices` |
| `accounting.tsx` | 456 | select | `cash_transactions` |
| `admin.about.tsx` | 58 | select | `about_section` |
| `admin.about.tsx` | 88 | upsert | `about_section` |
| `admin.banners.tsx` | 79 | select | `home_banners` |
| `admin.banners.tsx` | 102 | upsert | `home_banners` |
| `admin.banners.tsx` | 158 | select | `login_banner_settings` |
| `admin.banners.tsx` | 183 | update | `login_banner_settings` |
| `admin.categories.tsx` | 33 | select | `categories` |
| `admin.categories.tsx` | 52 | update | `categories` |
| `admin.categories.tsx` | 55 | insert | `categories` |
| `admin.categories.tsx` | 69 | delete | `categories` |
| `admin.chatbot.tsx` | 236 | update | `chatbot_faqs` |
| `admin.chatbot.tsx` | 245 | delete | `chatbot_faqs` |
| `admin.customers.tsx` | 208 | insert | `notifications` |
| `admin.debts.tsx` | 52 | insert | `cash_transactions` |
| `admin.index.tsx` | 33 | select | `orders` |
| `admin.index.tsx` | 34 | select | `orders` |
| `admin.index.tsx` | 35 | select (count) | `orders` |
| `admin.index.tsx` | 36 | select (count) | `orders` |
| `admin.index.tsx` | 37 | select (count) | `orders` |
| `admin.index.tsx` | 38 | select (count) | `orders` |
| `admin.index.tsx` | 39 | select | `products` |
| `admin.index.tsx` | 40 | select | `products` |
| `admin.index.tsx` | 41 | select | `order_items` |
| `admin.index.tsx` | 173 | insert | `welcome_messages` |
| `admin.messages.tsx` | 40 | update | `welcome_messages` |
| `admin.messages.tsx` | 48 | delete | `welcome_messages` |
| `admin.messages.tsx` | 135 | select | `customers` |
| `admin.messages.tsx` | 142 | storage upload | `app-assets` |
| `admin.messages.tsx` | 144 | storage getPublicUrl | `app-assets` |
| `admin.messages.tsx` | 151 | insert | `welcome_messages` |
| `admin.offers.tsx` | 36 | select | `coupons` |
| `admin.offers.tsx` | 44 | insert | `coupons` |
| `admin.offers.tsx` | 66 | delete | `coupons` |
| `admin.offers.tsx` | 74 | update | `coupons` |
| `admin.orders.tsx` | 55 | select | `orders` |
| `admin.products.tsx` | 47 | select | `products` |
| `admin.products.tsx` | 56 | select | `categories` |
| `admin.products.tsx` | 85 | update | `products` |
| `admin.products.tsx` | 89 | insert | `products` |
| `admin.products.tsx` | 103 | delete | `products` |
| `admin.purchases.tsx` | 69 | select | `products` |
| `admin.purchases.tsx` | 83 | insert | `purchase_invoices` |
| `admin.purchases.tsx` | 92 | insert | `purchase_invoice_items` |
| `admin.purchases.tsx` | 98 | update | `products` |
| `admin.purchases.tsx` | 102 | insert | `purchase_returns` |
| `admin.purchases.tsx` | 111 | insert | `purchase_return_items` |
| `admin.purchases.tsx` | 116 | update | `products` |
| `admin.purchases.tsx` | 178 | select | dynamic table |
| `cart.tsx` | 124 | insert | `order_items` |
| `delivery.$orderId.tsx` | 57 | rpc | `update_delivery_status` |
| `developer.saas.tsx` | 101 | select | `app_labels` |
| `developer.saas.tsx` | 109 | update | `app_labels` |
| `developer.saas.tsx` | 152 | select | `app_typography` |
| `developer.saas.tsx` | 160 | update | `app_typography` |
| `developer.saas.tsx` | 204 | select | `plan_config` |
| `developer.saas.tsx` | 212 | update | `plan_config` |
| `developer.tsx` | 94 | select (count) | `user_roles` |
| `developer.tsx` | 95 | select (count) | `customers` |
| `developer.tsx` | 104 | update | `app_settings` |
| `developer.tsx` | 117 | storage upload | `app-assets` |
| `developer.tsx` | 119 | storage getPublicUrl | `app-assets` |
| `developer.tsx` | 318 | select (count) | `orders` |
| `developer.tsx` | 319 | select (count) | `products` |
| `developer.tsx` | 320 | select (count) | `customers` |
| `developer.tsx` | 321 | select (count) | `products` |
| `developer.tsx` | 322 | select | `orders` |
| `login.tsx` | 80 | select | `login_banner_settings` |
| `login.tsx` | 89 | select | `user_roles` |
| `login.tsx` | 141 | rpc | `resolve_login_phone` |
| `login.tsx` | 158 | rpc | `is_username_available` |
| `login.tsx` | 195 | rpc | `is_username_available` |
| `login.tsx` | 197 | rpc | `set_my_username` |
| `notifications.tsx` | 42 | delete | `notifications` |
| `warehouse-advanced.tsx` | 103 | select | `products` |
| `warehouse-advanced.tsx` | 120 | update | `products` |
| `warehouse-advanced.tsx` | 122 | insert | `stock_movements` |
| `warehouse-advanced.tsx` | 215 | select | `stocktakes` |
| `warehouse-advanced.tsx` | 224 | insert | `stocktakes` |
| `warehouse-advanced.tsx` | 233 | update | `stocktakes` |
| `warehouse-advanced.tsx` | 272 | select | `products` |
| `warehouse-advanced.tsx` | 315 | update | `customer_returns` |
| `warehouse-advanced.tsx` | 359 | select | `bin_locations` |
| `warehouse-advanced.tsx` | 368 | insert | `bin_locations` |
| `warehouse-advanced.tsx` | 377 | delete | `bin_locations` |
| `warehouse.tsx` | 99 | update | `orders` |
| `warehouse.tsx` | 373 | rpc | `adjust_stock` |

## Notes on RPC and Storage

- **RPCs.** `withTenantScope` already sets `app.tenant_id` before
  invoking the callback, so calls of the form `scoped.rpc(...)` inside
  `runScoped(...)` automatically observe the GUC. No change to the RPC
  definitions is required for Phase 5; the RPC body itself can read
  `current_setting('app.tenant_id', true)` if it needs the active tenant.
- **Storage.** Supabase Storage buckets are not covered by RLS in the
  same way as Postgres tables. The `app-assets` bucket is currently
  shared. A follow-up phase (not part of task 5.1) needs to introduce
  per-tenant bucket prefixes (e.g. `app-assets/<tenant_slug>/...`) or
  per-tenant buckets; routing the storage calls through `runScoped` is
  still useful as a uniform migration boundary, but it does not by
  itself enforce isolation. Track this under the broader Phase 5/6
  work.

## Status legend

- **migrated** — call site has been routed through
  `useTenantScopedSupabase()` / `withScopedSupabase()` as part of
  task 5.1.
- (blank) — call site is still on the direct `supabase` client and
  awaits a follow-up batch.

When migrating a batch, edit this file and mark each row as
**migrated**. Strict RLS (task 7.1) must not be enabled until either
every row in this catalog is marked migrated **or** the Tenant Resolver
middleware (task 4.5) is wired up to set `app.tenant_id` on every
request before any query runs.
