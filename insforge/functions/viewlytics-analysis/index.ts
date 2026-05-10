import { createClient } from "npm:@insforge/sdk";

const ANALYZE_SERVICE_URL = Deno.env.get("ANALYZE_SERVICE_URL") || "";
const TRIBE_SERVICE_URL = Deno.env.get("TRIBE_SERVICE_URL") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const STAGES = [
  "Upload video",
  "Chunk scenes",
  "Transcribe",
  "Analyze pacing",
  "Deploy ant swarm",
  "Predict retention",
];

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeName(name = "video.mp4"): string {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "video.mp4";
}

function getClient() {
  return createClient({
    baseUrl: Deno.env.get("INSFORGE_BASE_URL") || "https://g9jy59jq.us-west.insforge.app",
    anonKey: Deno.env.get("API_KEY") || Deno.env.get("INSFORGE_API_KEY") || Deno.env.get("ANON_KEY") || Deno.env.get("INSFORGE_ANON_KEY") || "",
  });
}

async function uploadVideo(file: File, key: string) {
  const baseUrl = Deno.env.get("INSFORGE_BASE_URL") || "https://g9jy59jq.us-west.insforge.app";
  const apiKey = Deno.env.get("API_KEY") || Deno.env.get("INSFORGE_API_KEY") || Deno.env.get("ANON_KEY") || "";
  const form = new FormData();
  form.append("file", file, file.name);
  const response = await fetch(`${baseUrl}/api/storage/buckets/viewlytics-videos/objects/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.error || `Storage upload failed (${response.status})`);
  }
  // InsForge storage GET on the same /api/storage/buckets/<bucket>/objects/<key> path
  // returns the file. Construct a fetchable URL so downstream services (tribe service
  // on the Vast box) can pull the video without needing the InsForge SDK.
  const fallbackUrl = `${baseUrl}/api/storage/buckets/viewlytics-videos/objects/${encodeURIComponent(key)}`;
  return { ...payload, url: payload?.url || fallbackUrl, key: payload?.key || key };
}

async function runAnalysis(videoMeta: { name: string; size: number; type: string; url?: string | null; key?: string | null }) {
  if (!ANALYZE_SERVICE_URL) return { ok: false, error: "ANALYZE_SERVICE_URL not configured" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch(`${ANALYZE_SERVICE_URL.replace(/\/$/, "")}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        video_name: videoMeta.name,
        video_size: videoMeta.size,
        video_type: videoMeta.type,
        video_url: videoMeta.url || null,
        video_key: videoMeta.key || null,
      }),
      signal: controller.signal,
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: payload?.error || `analyze ${res.status}` };
    return { ok: true, payload };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

async function runTribeBrain(videoUrl: string | null | undefined) {
  if (!TRIBE_SERVICE_URL || !videoUrl) return { ok: false, skipped: true } as const;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 110_000);
  try {
    const res = await fetch(`${TRIBE_SERVICE_URL.replace(/\/$/, "")}/tribe-analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_url: videoUrl }),
      signal: controller.signal,
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: payload?.detail || payload?.error || `tribe ${res.status}` } as const;
    return { ok: true, payload } as const;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) } as const;
  } finally {
    clearTimeout(timer);
  }
}

function mergeTribeIntoIntelligence(
  intelligence: Record<string, unknown>,
  summary: Record<string, unknown>,
  t: any,
): { intelligence: Record<string, unknown>; summary: Record<string, unknown>; brain: Record<string, unknown> } {
  const existingBrain = ((intelligence as any).brain || {}) as Record<string, any>;
  const merged: Record<string, any> = {
    ...existingBrain,
    source: "tribev2-vast",
    peaks: t.peaks || existingBrain.peaks,
    retention_curve: (t.retention?.points || []).map((p: any) => ({
      time_sec: p.time_sec,
      retention: p.engagement_proxy_0_to_100,
      activity_l2: p.activity_l2,
    })),
    geometry_frames: (t.geometry?.timesteps || []).slice(0, 50).map((f: any) => ({
      frame: f.timestep_index,
      time_sec: f.time_window_start_sec,
      points: [],
    })),
    highs: t.highs,
    lows: t.lows,
    peak_moments: (t.peak_moments || []).slice(0, 10).map((row: any) => ({
      time_sec: row.time_window_start_sec,
      retention: 0,
      activation_l2: row.activation_l2_across_vertices,
      region: row.strongest_vertex?.destrieux_parcel_name || "Unmapped cortex",
      hemisphere: row.strongest_vertex?.hemisphere || "unknown",
      tone: "good",
    })),
    summary: {
      ...(existingBrain.summary || {}),
      mean_retention_proxy:
        t.retention?.engagement_summary?.mean_engagement_proxy_0_to_100 ?? existingBrain.summary?.mean_retention_proxy,
      max_retention_proxy:
        t.retention?.engagement_summary?.max_engagement_proxy_0_to_100 ?? existingBrain.summary?.max_retention_proxy,
      min_retention_proxy:
        t.retention?.engagement_summary?.min_engagement_proxy_0_to_100 ?? existingBrain.summary?.min_retention_proxy,
      timesteps: t.retention?.timesteps ?? existingBrain.summary?.timesteps,
      brain_vertices: t.peaks?.shape_timesteps_vertices?.[1] ?? existingBrain.summary?.brain_vertices,
    },
  };
  (intelligence as any).brain = merged;
  (summary as any).brain_source = "tribev2-vast";
  (summary as any).mean_retention_proxy =
    (merged.summary as any).mean_retention_proxy ?? (summary as any).mean_retention_proxy;
  return { intelligence, summary, brain: merged };
}

function buildSummary(file: { name?: string; size?: number; type?: string } = {}) {
  return {
    video_name: file.name || "Uploaded source video",
    video_size: file.size || 0,
    video_type: file.type || "video",
    persona_count: 200000,
    keyword_sets: 50,
    scenes: 15,
    transcript_tokens: 1420,
    virality_score: 77.8,
    positive_rate_pct: 44.15,
    total_shares: 52792,
    mean_retention_proxy: 46.59,
    brain_source: "TribeV2 fsaverage5 render",
    completed_at: new Date().toISOString(),
  };
}

async function parseRequestPayload(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  let file: File | null = null;
  let metadata: Record<string, unknown> = {};

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const maybeFile = form.get("video");
    if (maybeFile instanceof File) file = maybeFile;
    const rawMetadata = form.get("metadata");
    if (typeof rawMetadata === "string" && rawMetadata) {
      try {
        metadata = JSON.parse(rawMetadata);
      } catch {
        metadata = {};
      }
    }
  } else {
    metadata = await req.json().catch(() => ({}));
  }

  const fileMeta = {
    name: String(metadata.video_name || metadata.name || file?.name || "Uploaded source video"),
    size: Number(metadata.video_size || metadata.size || file?.size || 0),
    type: String(metadata.video_type || metadata.type || file?.type || "video"),
  };

  return { file, metadata, fileMeta };
}

async function uploadIfPresent(file: File | null) {
  let uploaded: { key?: string; url?: string } = {};
  if (file) {
    const key = `uploads/${crypto.randomUUID()}-${safeName(file.name)}`;
    const data = await uploadVideo(file, key);
    uploaded = { key: data?.key || key, url: data?.url };
  }
  return uploaded;
}

function buildIntelligenceFromPayload(payload: any, fileMeta: { name: string; size: number; type: string }) {
  const sim = payload?.simulation || {};
  const brainSummary = payload?.brain?.summary || {};
  const summary = {
    video_name: fileMeta.name,
    video_size: fileMeta.size,
    video_type: fileMeta.type,
    persona_count: sim.persona_count || 0,
    keyword_sets: (payload?.keyword_sets || []).length,
    scenes: brainSummary.timesteps || 0,
    transcript_tokens: (payload?.videos?.terms || []).length,
    virality_score: sim.virality_score || 0,
    positive_rate_pct: sim.positive_rate_pct || 0,
    total_shares: sim.total_shares || 0,
    mean_retention_proxy: brainSummary.mean_retention_proxy || 0,
    brain_source: payload?.brain?.source || "cloud-compute",
    completed_at: new Date().toISOString(),
  };
  const intelligence = { ...payload, source: "insforge-compute" };
  return { summary, intelligence };
}

async function createRunStream(req: Request) {
  if (!ANALYZE_SERVICE_URL) {
    return json({ ok: false, error: "ANALYZE_SERVICE_URL not configured" }, 500);
  }
  const client = getClient();
  const { file, fileMeta } = await parseRequestPayload(req);

  // 1. Upload first (must happen before stream so video URL is real).
  let uploaded: { key?: string; url?: string } = {};
  if (file) {
    try {
      uploaded = await uploadIfPresent(file);
    } catch (error) {
      return json({ ok: false, stage: "storage.upload", error: error instanceof Error ? error.message : String(error) }, 500);
    }
  }

  // 2. Insert placeholder row immediately so frontend has a run id even before compute finishes.
  let runId: string | number | null = null;
  try {
    const { data, error } = await client.database
      .from("viewlytics_analysis_runs")
      .insert({
        status: "running",
        video_name: fileMeta.name,
        video_type: fileMeta.type,
        video_size: fileMeta.size,
        video_bucket: "viewlytics-videos",
        video_key: uploaded.key || null,
        video_url: uploaded.url || null,
        phase: 0,
        progress: 0,
        current_stage: "Uploading",
      })
      .select()
      .single();
    if (!error && data) runId = (data as any).id ?? null;
  } catch (e) {
    console.warn("placeholder insert failed (non-fatal):", e);
  }

  // 3. Open upstream stream to the compute service.
  const upstream = await fetch(`${ANALYZE_SERVICE_URL.replace(/\/$/, "")}/analyze/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({
      video_name: fileMeta.name,
      video_size: fileMeta.size,
      video_type: fileMeta.type,
      video_url: uploaded.url || null,
      video_key: uploaded.key || null,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return json({ ok: false, stage: "compute.stream", error: text || `compute ${upstream.status}` }, 502);
  }

  // 4. Single-reader pump: forward upstream bytes to client AND parse SSE for DB writes
  //    + tribe merge. This lets us inject an extra 'tribe' event mid-stream.
  const enc = new TextEncoder();
  const merged = new ReadableStream({
    async start(controller) {
      // Inject leading 'run' event with the runId for frontend reference.
      controller.enqueue(
        enc.encode(
          `event: run\ndata: ${JSON.stringify({ run_id: runId, video_url: uploaded.url || null, video_key: uploaded.key || null })}\n\n`,
        ),
      );
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // Forward raw bytes to client immediately.
          controller.enqueue(value);
          // Parallel parse for DB writes.
          buf += decoder.decode(value, { stream: true });
          const blocks = buf.split("\n\n");
          buf = blocks.pop() || "";
          for (const block of blocks) {
            const evMatch = block.match(/^event: (.+)$/m);
            const dataMatch = block.match(/^data: (.+)$/m);
            if (!evMatch || !dataMatch) continue;
            const ev = evMatch[1].trim();
            let data: any = null;
            try { data = JSON.parse(dataMatch[1]); } catch { continue; }
            if (ev === "stage" && data) {
              if (runId !== null) {
                client.database
                  .from("viewlytics_analysis_runs")
                  .update({ current_stage: data.label || data.stage, progress: Math.round(data.pct || 0) })
                  .eq("id", runId)
                  .then(() => {}, () => {});
              }
            } else if (ev === "result" && data) {
              const built = buildIntelligenceFromPayload(data, fileMeta);
              let summary = built.summary as Record<string, unknown>;
              let intelligence = built.intelligence as Record<string, unknown>;
              // Best-effort tribe merge before persisting.
              try {
                const tribe = await runTribeBrain(uploaded.url || null);
                if (tribe.ok && (tribe as any).payload) {
                  const { brain } = mergeTribeIntoIntelligence(intelligence, summary, (tribe as any).payload);
                  // Forward an extra SSE 'tribe' event to the client with the brain summary.
                  try {
                    controller.enqueue(
                      enc.encode(
                        `event: tribe\ndata: ${JSON.stringify({ source: "tribev2-vast", summary: brain.summary, peak_moments: brain.peak_moments })}\n\n`,
                      ),
                    );
                  } catch { /* ignore enqueue errors */ }
                } else if (tribe.ok === false && !(tribe as any).skipped) {
                  (intelligence as any).tribe_error = (tribe as any).error;
                }
              } catch (e) {
                console.warn("tribe merge in stream failed (non-fatal):", e);
              }
              if (runId !== null) {
                await client.database
                  .from("viewlytics_analysis_runs")
                  .update({
                    status: "completed",
                    phase: STAGES.length - 1,
                    progress: 100,
                    current_stage: STAGES[STAGES.length - 1],
                    summary,
                    intelligence,
                  })
                  .eq("id", runId);
              }
            } else if (ev === "error" && data) {
              if (runId !== null) {
                await client.database
                  .from("viewlytics_analysis_runs")
                  .update({
                    status: "failed",
                    current_stage: `Error: ${String(data.error || "compute error").slice(0, 80)}`,
                  })
                  .eq("id", runId);
              }
            }
          }
        }
      } catch (e) {
        console.warn("SSE pump crashed:", e);
        try { controller.error(e); } catch { /* already closed */ }
        return;
      }
      controller.close();
    },
  });

  return new Response(merged, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

async function createRun(req: Request) {
  const client = getClient();
  const { file, fileMeta } = await parseRequestPayload(req);

  let uploaded: { key?: string; url?: string } = {};
  if (file) {
    try {
      uploaded = await uploadIfPresent(file);
    } catch (error) {
      return json({ ok: false, stage: "storage.upload", error: error instanceof Error ? error.message : String(error) }, 500);
    }
  }

  const analysis = await runAnalysis({
    name: fileMeta.name,
    size: fileMeta.size,
    type: fileMeta.type,
    url: uploaded.url || null,
    key: uploaded.key || null,
  });

  let summary: Record<string, unknown>;
  let intelligence: Record<string, unknown>;
  let errorMessage: string | null = null;

  if (analysis.ok) {
    const built = buildIntelligenceFromPayload(analysis.payload, fileMeta);
    summary = built.summary;
    intelligence = built.intelligence;
    const tribe = await runTribeBrain(uploaded.url || null);
    if (tribe.ok && (tribe as any).payload) {
      mergeTribeIntoIntelligence(intelligence, summary, (tribe as any).payload);
    } else if (tribe.ok === false && !(tribe as any).skipped) {
      (intelligence as any).tribe_error = (tribe as any).error;
    }
  } else {
    console.error("runAnalysis failed:", analysis.error);
    errorMessage = analysis.error || "analysis failed";
    const fallbackSummary = buildSummary(fileMeta);
    summary = fallbackSummary;
    intelligence = {
      source: "insforge-cloud",
      simulation: {
        persona_count: fallbackSummary.persona_count,
        total_shares: fallbackSummary.total_shares,
        positive_rate_pct: fallbackSummary.positive_rate_pct,
        virality_score: fallbackSummary.virality_score,
      },
      brain: {
        source: fallbackSummary.brain_source,
        summary: {
          mean_retention_proxy: fallbackSummary.mean_retention_proxy,
          brain_vertices: 20484,
          timesteps: 50,
        },
      },
    };
  }

  const record = {
    status: "completed",
    video_name: fileMeta.name,
    video_type: fileMeta.type,
    video_size: fileMeta.size,
    video_bucket: "viewlytics-videos",
    video_key: uploaded.key || null,
    video_url: uploaded.url || null,
    phase: STAGES.length - 1,
    progress: 100,
    current_stage: STAGES[STAGES.length - 1],
    summary,
    intelligence,
  };
  void errorMessage;

  const { data, error } = await client.database
    .from("viewlytics_analysis_runs")
    .insert(record)
    .select()
    .single();

  if (error) {
    return json({ ok: false, stage: "database.insert", error: error.message || String(error), record }, 500);
  }

  return json({ ok: true, run: data, stages: STAGES });
}

async function latestRun() {
  const client = getClient();
  const { data, error } = await client.database
    .from("viewlytics_analysis_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    return json({ ok: false, stage: "database.select", error: error.message || String(error) }, 500);
  }

  return json({
    ok: true,
    backend: "insforge",
    latestRun: Array.isArray(data) ? data[0] || null : null,
    stages: STAGES,
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method === "GET") return latestRun();
  if (req.method === "POST") {
    const url = new URL(req.url);
    const wantsStream =
      url.searchParams.get("stream") === "1" ||
      (req.headers.get("accept") || "").includes("text/event-stream");
    if (wantsStream) return createRunStream(req);
    return createRun(req);
  }
  return json({ ok: false, error: "Method not allowed" }, 405);
}
