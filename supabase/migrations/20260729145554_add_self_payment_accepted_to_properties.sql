-- The public listing cards advertise how a home can be paid for. Until now the
-- only flag was section_8_accepted, whose editor toggle reads as an either/or
-- (Private Rent | Section 8 Accepted), so "takes vouchers AND private renters"
-- and "vouchers only" were indistinguishable. Split the second half out so a
-- home can carry either badge, both, or neither.
alter table public.properties
  add column if not exists self_payment_accepted boolean not null default true;

comment on column public.properties.self_payment_accepted is
  'Home accepts a renter paying their own way (private rent), independent of section_8_accepted. Drives the public "Self Payment" badge.';

-- 13671 Euclid Ave is voucher-only: drop the Self Payment badge on all 5 units.
update public.properties
set self_payment_accepted = false
where address ilike '13671 Euclid Ave%';
