
-- Helper: check that a property belongs to the caller's organization
CREATE OR REPLACE FUNCTION public.property_in_user_org(_property_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = _property_id
      AND p.organization_id = public.get_user_organization_id(auth.uid())
  )
$$;

CREATE OR REPLACE FUNCTION public.is_staff_role()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = ANY (ARRAY['superadmin','admin','team'])
  )
$$;

-- documents
DROP POLICY IF EXISTS "Admins full access documents" ON public.documents;
CREATE POLICY "Staff org-scoped access documents" ON public.documents
  FOR ALL TO authenticated
  USING (public.is_staff_role() AND public.property_in_user_org(property_id))
  WITH CHECK (public.is_staff_role() AND public.property_in_user_org(property_id));

-- leases
DROP POLICY IF EXISTS "Admins full access leases" ON public.leases;
CREATE POLICY "Staff org-scoped access leases" ON public.leases
  FOR ALL TO authenticated
  USING (public.is_staff_role() AND public.property_in_user_org(property_id))
  WITH CHECK (public.is_staff_role() AND public.property_in_user_org(property_id));

-- rental_registrations
DROP POLICY IF EXISTS "staff_all_rental_registrations" ON public.rental_registrations;
CREATE POLICY "Staff org-scoped rental_registrations" ON public.rental_registrations
  FOR ALL TO authenticated
  USING (public.is_staff_role() AND public.property_in_user_org(property_id))
  WITH CHECK (public.is_staff_role() AND public.property_in_user_org(property_id));

-- statements
DROP POLICY IF EXISTS "Admins full access statements" ON public.statements;
CREATE POLICY "Staff org-scoped access statements" ON public.statements
  FOR ALL TO authenticated
  USING (public.is_staff_role() AND public.property_in_user_org(property_id))
  WITH CHECK (public.is_staff_role() AND public.property_in_user_org(property_id));

-- tenants
DROP POLICY IF EXISTS "Admins full access tenants" ON public.tenants;
CREATE POLICY "Staff org-scoped access tenants" ON public.tenants
  FOR ALL TO authenticated
  USING (public.is_staff_role() AND public.property_in_user_org(property_id))
  WITH CHECK (public.is_staff_role() AND public.property_in_user_org(property_id));

-- transactions
DROP POLICY IF EXISTS "Admins full access transactions" ON public.transactions;
CREATE POLICY "Staff org-scoped access transactions" ON public.transactions
  FOR ALL TO authenticated
  USING (public.is_staff_role() AND public.property_in_user_org(property_id))
  WITH CHECK (public.is_staff_role() AND public.property_in_user_org(property_id));

-- utilities
DROP POLICY IF EXISTS "Admins full access utilities" ON public.utilities;
CREATE POLICY "Staff org-scoped access utilities" ON public.utilities
  FOR ALL TO authenticated
  USING (public.is_staff_role() AND public.property_in_user_org(property_id))
  WITH CHECK (public.is_staff_role() AND public.property_in_user_org(property_id));

-- work_orders
DROP POLICY IF EXISTS "Admins full access work_orders" ON public.work_orders;
DROP POLICY IF EXISTS "staff_all_work_orders" ON public.work_orders;
CREATE POLICY "Staff org-scoped access work_orders" ON public.work_orders
  FOR ALL TO authenticated
  USING (public.is_staff_role() AND public.property_in_user_org(property_id))
  WITH CHECK (public.is_staff_role() AND public.property_in_user_org(property_id));

-- work_order_files (join via work_orders)
DROP POLICY IF EXISTS "Admins full access work_order_files" ON public.work_order_files;
DROP POLICY IF EXISTS "staff_all_work_order_files" ON public.work_order_files;
CREATE POLICY "Staff org-scoped access work_order_files" ON public.work_order_files
  FOR ALL TO authenticated
  USING (
    public.is_staff_role() AND EXISTS (
      SELECT 1 FROM public.work_orders wo
      WHERE wo.id = work_order_files.work_order_id
        AND public.property_in_user_org(wo.property_id)
    )
  )
  WITH CHECK (
    public.is_staff_role() AND EXISTS (
      SELECT 1 FROM public.work_orders wo
      WHERE wo.id = work_order_files.work_order_id
        AND public.property_in_user_org(wo.property_id)
    )
  );

-- activity_log — scope by property org when property_id is set,
-- otherwise limit to entries authored by users in the caller's org.
DROP POLICY IF EXISTS "staff_read_activity" ON public.activity_log;
DROP POLICY IF EXISTS "staff_insert_activity" ON public.activity_log;
CREATE POLICY "Staff org-scoped read activity" ON public.activity_log
  FOR SELECT TO authenticated
  USING (
    public.is_staff_role() AND (
      (property_id IS NOT NULL AND public.property_in_user_org(property_id))
      OR (property_id IS NULL AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = activity_log.user_id
          AND u.organization_id = public.get_user_organization_id(auth.uid())
      ))
      OR (property_id IS NULL AND user_id = auth.uid())
    )
  );
CREATE POLICY "Staff org-scoped insert activity" ON public.activity_log
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_staff_role() AND (
      property_id IS NULL OR public.property_in_user_org(property_id)
    )
  );

-- team_permissions — target user must be in caller's org
DROP POLICY IF EXISTS "merged_all_public" ON public.team_permissions;
CREATE POLICY "Admins org-scoped team_permissions" ON public.team_permissions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = ANY (ARRAY['superadmin','admin'])
    )
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = team_permissions.user_id
        AND u.organization_id = public.get_user_organization_id(auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = ANY (ARRAY['superadmin','admin'])
    )
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = team_permissions.user_id
        AND u.organization_id = public.get_user_organization_id(auth.uid())
    )
  );

-- tickets — scope by property org when property_id is set, otherwise creator's org
DROP POLICY IF EXISTS "merged_all_public" ON public.tickets;
CREATE POLICY "Staff+creator org-scoped tickets" ON public.tickets
  FOR ALL TO authenticated
  USING (
    created_by = auth.uid()
    OR (
      public.is_staff_role() AND (
        (property_id IS NOT NULL AND public.property_in_user_org(property_id))
        OR (property_id IS NULL AND EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.auth_user_id = tickets.created_by
            AND u.organization_id = public.get_user_organization_id(auth.uid())
        ))
      )
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    OR (
      public.is_staff_role() AND (
        property_id IS NULL OR public.property_in_user_org(property_id)
      )
    )
  );

-- ticket_messages — inherit via tickets
DROP POLICY IF EXISTS "merged_all_public" ON public.ticket_messages;
CREATE POLICY "Ticket-scoped ticket_messages" ON public.ticket_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_messages.ticket_id
        AND (
          t.created_by = auth.uid()
          OR (
            public.is_staff_role() AND (
              (t.property_id IS NOT NULL AND public.property_in_user_org(t.property_id))
              OR (t.property_id IS NULL AND EXISTS (
                SELECT 1 FROM public.users u
                WHERE u.auth_user_id = t.created_by
                  AND u.organization_id = public.get_user_organization_id(auth.uid())
              ))
            )
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_messages.ticket_id
        AND (
          t.created_by = auth.uid()
          OR (
            public.is_staff_role() AND (
              t.property_id IS NULL OR public.property_in_user_org(t.property_id)
            )
          )
        )
    )
  );
