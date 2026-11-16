-- seed_demo_subscriptions.sql
-- Demo data for the admin subscription + revenue screens:
--   6 students on a paid plan  (4 × Basic, 1 × Standard, 1 × Premium)
--   one SUCCEEDED SUBSCRIPTION payment per plan so payment history and dashboard revenue agree
--   every one of them enrolled in at least one published course
--
-- Mirrors what PaymentTransactionService.grantSubscription does: the previous ACTIVE rows are
-- flagged SUPERSEDED and one ACTIVE row is created for the plan period. Re-runnable: a student
-- that already holds the plan (and an ACTIVE enrollment) is left alone.
--
-- Order codes are 'SEED-SUB-<userId>-<planId>', which is what makes the payments idempotent and
-- easy to spot/delete. payos_order_code stays NULL so no PayOS webhook can ever match these rows.

-- 0) Demo catalog prices: a paid course sells between 200,000 and 1,000,000 VND. Free courses
--    (price 0) are left untouched. Every seat and every course payment below is priced from here.
UPDATE courses c
SET price = v.price, updated_at = NOW()
FROM (VALUES
    ('java programming masterclass course', 599000::numeric),
    ('python coding course',                 499000::numeric),
    ('ịkjkuu',                               349000::numeric),
    ('beginners coding course',              249000::numeric),
    ('intermediate java course',             449000::numeric),
    ('advanced python course',               499000::numeric),
    ('advanced math course',                 399000::numeric),
    ('python',                               399000::numeric),
    ('new',                                  299000::numeric),
    ('math course',                          249000::numeric)
) AS v(title, price)
WHERE LOWER(c.title) = v.title AND c.price IS DISTINCT FROM v.price;

-- The demo students, the plan they should hold and a course they should be enrolled in.
DROP TABLE IF EXISTS seed_demo_target;
CREATE TEMP TABLE seed_demo_target (email TEXT PRIMARY KEY, plan_name TEXT NOT NULL, course_id BIGINT NOT NULL);

-- student1@examprep.local and student@gmail.com are on Basic by request.
INSERT INTO seed_demo_target (email, plan_name, course_id) VALUES
    ('student1@examprep.local',    'Basic',     6),
    ('student@gmail.com',          'Basic',     6),
    ('student2@examprep.local',    'Basic',    33),
    ('hieupg12@gmail.com',         'Basic',     6),
    ('trankhai15052005@gmail.com', 'Standard', 28),
    ('oldmansenji@gmail.com',      'Premium',  12);

-- 1) Close whatever ACTIVE plan they hold now (Free Plan or an older purchase).
UPDATE user_subscriptions s
SET status = 'SUPERSEDED', auto_renew = FALSE
FROM seed_demo_target t
JOIN users u ON LOWER(u.email) = LOWER(t.email) AND u.role_name = 'STUDENT'
WHERE s.user_id = u.user_id AND s.status = 'ACTIVE';

-- 2) Open the paid plan period, snapshotting the list price as paid_amount.
INSERT INTO user_subscriptions (user_id, plan_id, start_date, end_date, status, paid_amount, auto_renew, created_at)
SELECT u.user_id, p.plan_id, NOW(), NOW() + (p.duration_days || ' days')::interval, 'ACTIVE', p.price, FALSE, NOW()
FROM seed_demo_target t
JOIN users u ON LOWER(u.email) = LOWER(t.email) AND u.role_name = 'STUDENT'
JOIN subscription_plans p ON LOWER(p.plan_name) = LOWER(t.plan_name) AND p.deleted_at IS NULL
WHERE NOT EXISTS (
    SELECT 1 FROM user_subscriptions s
    WHERE s.user_id = u.user_id AND s.plan_id = p.plan_id AND s.status = 'ACTIVE'
      AND s.start_date <= NOW() AND s.end_date >= NOW()
);

-- 3) The matching SUCCEEDED payment: this is what payment history and the revenue report read.
INSERT INTO payments (user_id, order_code, type, ref_id, amount, currency, status,
                      discount_amount, discount_reserved, title, paid_at, created_at, updated_at)
SELECT u.user_id,
       'SEED-SUB-' || u.user_id || '-' || p.plan_id,
       'SUBSCRIPTION', p.plan_id, p.price, 'VND', 'SUCCEEDED',
       0, FALSE, p.plan_name, NOW(), NOW(), NOW()
FROM seed_demo_target t
JOIN users u ON LOWER(u.email) = LOWER(t.email) AND u.role_name = 'STUDENT'
JOIN subscription_plans p ON LOWER(p.plan_name) = LOWER(t.plan_name) AND p.deleted_at IS NULL
WHERE NOT EXISTS (
    SELECT 1 FROM payments pm WHERE pm.order_code = 'SEED-SUB-' || u.user_id || '-' || p.plan_id
);

-- 4) Point the ACTIVE subscription at its payment (the column the real checkout fills in).
UPDATE user_subscriptions s
SET payment_id = pm.payment_id
FROM payments pm
WHERE pm.order_code = 'SEED-SUB-' || s.user_id || '-' || s.plan_id
  AND s.status = 'ACTIVE'
  AND s.payment_id IS NULL;

-- 5) Give every demo student at least one ACTIVE enrollment in a published course.
INSERT INTO enrollments (course_id, user_id, enrolled_at, status, paid_amount, progress)
SELECT c.course_id, u.user_id, NOW(), 'ACTIVE', c.price, 0
FROM seed_demo_target t
JOIN users u ON LOWER(u.email) = LOWER(t.email) AND u.role_name = 'STUDENT'
JOIN courses c ON c.course_id = t.course_id AND c.is_published = TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.user_id = u.user_id AND e.status = 'ACTIVE'
);

-- 6) Course revenue is read from collected payments, so every seat has to carry one, at the list
--    price. Without this an enrollment created without a checkout (seed, manual grant) keeps
--    revenue at 0 while the Enrollments column still counts the student.
--
-- 6a) A live enrollment on a paid course records what that seat is worth.
UPDATE enrollments e
SET paid_amount = c.price
FROM courses c
WHERE c.course_id = e.course_id
  AND e.status <> 'CANCELLED'
  AND c.price > 0
  AND e.paid_amount IS DISTINCT FROM c.price;

-- 6b) One SUCCEEDED COURSE payment per live enrollment, at the course price.
--     First bring the payments that already exist (real checkouts included) up to the list price,
--     so a price change never leaves revenue behind the price tag.
UPDATE payments p
SET amount = c.price, updated_at = NOW()
FROM courses c
WHERE p.type = 'COURSE' AND p.status = 'SUCCEEDED' AND p.ref_id = c.course_id
  AND c.price > 0 AND p.amount IS DISTINCT FROM c.price;

--     Then add the missing one for a seat nobody charged for. A seat that already has a real
--     checkout payment is skipped so nothing is counted twice; the seed rows are upserted by
--     order_code so re-running updates their amount.
INSERT INTO payments (user_id, order_code, type, ref_id, amount, currency, status,
                      discount_amount, discount_reserved, title, paid_at, created_at, updated_at)
SELECT e.user_id, 'SEED-COURSE-' || e.enrollment_id, 'COURSE', e.course_id, c.price,
       'VND', 'SUCCEEDED', 0, FALSE, c.title, e.enrolled_at, NOW(), NOW()
FROM enrollments e
JOIN courses c ON c.course_id = e.course_id
WHERE e.status <> 'CANCELLED'
  AND c.price > 0
  AND NOT EXISTS (
      SELECT 1 FROM payments p
      WHERE p.type = 'COURSE' AND p.status = 'SUCCEEDED'
        AND p.user_id = e.user_id AND p.ref_id = e.course_id
        AND p.order_code NOT LIKE 'SEED-COURSE-%'
  )
ON CONFLICT (order_code) DO UPDATE
SET amount = EXCLUDED.amount, title = EXCLUDED.title, updated_at = NOW();

-- 6c) A cancelled or expired checkout still lists its attempted amount in payment history; bring
--     those rows up to the current price too, so a price change leaves no 15 VND artifact behind.
--     They keep their status, so the revenue figures never count them.
UPDATE payments p
SET amount = c.price, updated_at = NOW()
FROM courses c
WHERE p.type = 'COURSE' AND p.ref_id = c.course_id AND p.status <> 'SUCCEEDED'
  AND c.price > 0 AND p.amount IS DISTINCT FROM c.price;

DROP TABLE seed_demo_target;
