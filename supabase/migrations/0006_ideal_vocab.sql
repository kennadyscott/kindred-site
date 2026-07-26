-- ============================================================================
-- 0006 — Ideal-client vocab updates
--
-- Ideal client model changed: age is now life STAGES (the therapist picks a
-- stage; the client enters an exact age and the app maps it to a stage), and
-- field-of-work uses a short pill set + an "Other" dropdown drawn from field_more.
-- The age/stage min-max mapping is app logic (ageToBand); these rows are the
-- display labels so the DB stays a faithful source of truth.
-- ============================================================================

-- refresh age_band to the life-stage labels
delete from vocab where kind = 'age_band';
insert into vocab (kind, value, sort) values
  ('age_band', 'Toddlers', 0),
  ('age_band', 'Children', 1),
  ('age_band', 'Preteen',  2),
  ('age_band', 'Teens',    3),
  ('age_band', 'Adults',   4),
  ('age_band', 'Seniors',  5)
on conflict (kind, value) do nothing;

-- primary field-of-work pills
delete from vocab where kind = 'client_field';
insert into vocab (kind, value, sort) values
  ('client_field', 'First responder', 0),
  ('client_field', 'Healthcare', 1),
  ('client_field', 'Military & Veteran', 2),
  ('client_field', 'Education', 3),
  ('client_field', 'Entrepreneur', 4),
  ('client_field', 'Full-time parent', 5)
on conflict (kind, value) do nothing;

-- the fuller field list behind "Other"
insert into vocab (kind, value, sort) values
  ('field_more', 'Tech', 0),
  ('field_more', 'Finance & Legal', 1),
  ('field_more', 'Legal', 2),
  ('field_more', 'Service industry', 3),
  ('field_more', 'Retail', 4),
  ('field_more', 'Hospitality', 5),
  ('field_more', 'Student', 6),
  ('field_more', 'Creative', 7),
  ('field_more', 'Skilled trades', 8),
  ('field_more', 'Government', 9),
  ('field_more', 'Nonprofit', 10),
  ('field_more', 'Sales', 11),
  ('field_more', 'Agriculture', 12),
  ('field_more', 'Transportation', 13),
  ('field_more', 'Manufacturing', 14),
  ('field_more', 'Small business owner', 15),
  ('field_more', 'Remote / gig work', 16),
  ('field_more', 'Between jobs', 17),
  ('field_more', 'Retired', 18)
on conflict (kind, value) do nothing;
