-- The mobile app stores expiry dates as Jalali YYYY/MM/DD strings.
-- Keep the cloud column textual so Jalali dates are not rejected or converted as Gregorian dates.
alter table public.pantry_items
  alter column expires_at type text
  using expires_at::text;
