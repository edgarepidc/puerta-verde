-- Open-account cobro: customers who take product now and pay later.

alter type public.payment_method add value if not exists 'on_account';
