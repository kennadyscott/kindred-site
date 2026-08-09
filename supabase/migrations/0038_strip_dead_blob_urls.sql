-- ============================================================================
-- 0038 -- Remove blob: URLs that were saved as if they were addresses
--
-- The therapist video upload called URL.createObjectURL(file) and stored the
-- result -- a `blob:` URL -- into therapists.media->>'video' and into video
-- blocks in therapists.blocks.
--
-- A blob: URL is a handle into ONE browser tab's memory. It is not a location.
-- It dies when the tab closes and it means nothing to anybody else, so what
-- got written to Postgres was a permanently dead pointer: gone on reload for
-- the therapist who recorded it, and unopenable by every client, always.
--
-- Uploading is disabled in the app until videos go to Supabase Storage (see
-- VIDEO_UPLOAD_ENABLED in app.js). This clears what is already stored, so no
-- profile renders a <video> element that can never load.
--
-- Only blob: is touched. Seeded https videos, and real ones once Storage
-- lands, are left exactly alone -- playback was never the broken part.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 -- media.video
-- ---------------------------------------------------------------------------
update therapists
   set media = jsonb_set(media, '{video}', 'null'::jsonb)
 where media ? 'video'
   and media->>'video' like 'blob:%';

-- ---------------------------------------------------------------------------
-- 2 -- video blocks in the ordered feed.
--
--     Dropped rather than blanked. A video block with no src renders as an
--     empty "add a hello" slot in the therapist's editor, which would invite
--     them to re-record straight into the same dead end while uploads are off.
--     Photo and prompt blocks keep their positions; only the video goes.
-- ---------------------------------------------------------------------------
update therapists
   set blocks = coalesce((
         select jsonb_agg(b order by ord)
           from jsonb_array_elements(blocks) with ordinality as e(b, ord)
          where not (b->>'type' = 'video' and coalesce(b->>'src', '') like 'blob:%')
       ), '[]'::jsonb)
 where jsonb_typeof(blocks) = 'array'
   and exists (
     select 1 from jsonb_array_elements(blocks) b
      where b->>'type' = 'video' and coalesce(b->>'src', '') like 'blob:%'
   );

-- ---------------------------------------------------------------------------
-- 3 -- Proof. Both should return zero.
-- ---------------------------------------------------------------------------
-- select count(*) from therapists where media->>'video' like 'blob:%';
-- select count(*) from therapists t, jsonb_array_elements(t.blocks) b
--  where jsonb_typeof(t.blocks) = 'array' and b->>'src' like 'blob:%';
