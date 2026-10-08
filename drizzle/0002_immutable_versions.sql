CREATE FUNCTION raxlet_reject_version_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Script versions and metadata are immutable; create a new version' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER immutable_script_versions BEFORE UPDATE ON script_versions
FOR EACH ROW EXECUTE FUNCTION raxlet_reject_version_update();
--> statement-breakpoint
CREATE TRIGGER immutable_script_metadata BEFORE UPDATE ON script_metadata
FOR EACH ROW EXECUTE FUNCTION raxlet_reject_version_update();
