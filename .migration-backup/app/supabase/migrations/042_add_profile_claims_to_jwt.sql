-- Function to update auth.users.app_metadata based on public.profiles
CREATE OR REPLACE FUNCTION public.update_user_app_metadata_from_profiles()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (NEW.is_admin IS DISTINCT FROM OLD.is_admin OR NEW.role IS DISTINCT FROM OLD.role)) THEN
        UPDATE auth.users
        SET
            raw_app_meta_data = raw_app_meta_data || jsonb_build_object(
                'is_admin', NEW.is_admin,
                'user_role', NEW.role
            )
        WHERE id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call the function after insert or update on public.profiles
CREATE OR REPLACE TRIGGER on_profile_change
AFTER INSERT OR UPDATE OF is_admin, role ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_user_app_metadata_from_profiles();

-- Optional: For existing users, you might want to run a one-time update
-- This will update all existing users' app_metadata based on their current profile
DO $$
DECLARE
    profile_row record;
BEGIN
    FOR profile_row IN
        SELECT id, is_admin, role FROM public.profiles
    LOOP
        UPDATE auth.users
        SET
            raw_app_meta_data = raw_app_meta_data || jsonb_build_object(
                'is_admin', profile_row.is_admin,
                'user_role', profile_row.role
            )
        WHERE id = profile_row.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql;