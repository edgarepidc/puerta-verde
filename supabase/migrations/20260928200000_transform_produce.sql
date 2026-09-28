-- Conversion of leftover produce into pulp, paletas, etc. (not merma).
-- Separate from the RPC so Postgres can use the new enum value after commit.

alter type public.inventory_movement_type add value if not exists 'transform';
