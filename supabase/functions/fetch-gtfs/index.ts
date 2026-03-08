import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GTFS_URL = "https://api.transitous.org/gtfs/al_tirana.gtfs.zip";
const CACHE_FILE = "al_tirana.gtfs.zip";
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Check if cached file exists and is fresh
    const { data: files } = await supabase.storage
      .from("gtfs-cache")
      .list("", { search: CACHE_FILE });

    const cached = files?.find((f) => f.name === CACHE_FILE);

    if (cached) {
      const updatedAt = new Date(cached.updated_at).getTime();
      const age = Date.now() - updatedAt;

      if (age < CACHE_MAX_AGE_MS) {
        // Serve from cache
        const { data, error } = await supabase.storage
          .from("gtfs-cache")
          .download(CACHE_FILE);

        if (data && !error) {
          return new Response(data, {
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/zip',
              'Cache-Control': 'public, max-age=3600',
              'X-Cache': 'HIT',
            },
          });
        }
      }
    }

    // Fetch fresh data
    const response = await fetch(GTFS_URL);
    if (!response.ok) {
      return new Response(JSON.stringify({ error: `GTFS fetch failed: ${response.status}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: "application/zip" });

    // Upload to cache (upsert)
    await supabase.storage
      .from("gtfs-cache")
      .upload(CACHE_FILE, blob, { upsert: true, contentType: "application/zip" });

    return new Response(arrayBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/zip',
        'Cache-Control': 'public, max-age=3600',
        'X-Cache': 'MISS',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
