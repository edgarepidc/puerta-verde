-- Conversion of produce into last-minute bags (not merma).
-- Separate from the tables/RPC so Postgres can use the new enum value
-- after this migration commits.

alter type public.inventory_movement_type add value if not exists 'pack';
