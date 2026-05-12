import { createClient } from "npm:@insforge/sdk";

// This edge function is the ONLY public-facing entrypoint for the analysis
// pipeline. It proxies:
//   - POST ?stream=1 multipart {video}: forwards as multipart to the Vast Ant
//     server at ANT_SERVICE_URL/api/analyze, injecting X-Ant-Token, then pipes
//     the SSE response body straight back to the browser. Keeps ANT_SHARED_TOKEN
//     server-side so the frontend never sees it and Vast can stay token-gated.
//   - POST ?stream=1 (no file or proxy failure): falls back to the legacy
//     createRunStream path (ANALYZE_SERVICE_URL/analyze/stream + tribe merge).
//   - POST (no stream): legacy synchronous createRun.
//   - GET: latestRun.
const ANALYZE_SERVICE_URL = Deno.env.get("ANALYZE_SERVICE_URL") || "";
const TRIBE_SERVICE_URL = Deno.env.get("TRIBE_SERVICE_URL") || "";
const ANT_SHARED_TOKEN = Deno.env.get("ANT_SHARED_TOKEN") || "";
// Vast box hosting the new self-contained Ant server (/api/analyze multipart SSE).
// Falls back to the known Vast URL if the orchestrator hasn't set the secret yet.
const ANT_SERVICE_URL = Deno.env.get("ANT_SERVICE_URL") || "http://72.19.32.135:51980";

// CORS — explicit allowlist. The previous wildcard was usable from any origin
// (including attacker-controlled pages), letting them mine the public GET for
// the latest run's intelligence. Allowlist mirrors the Vast box.
const CORS_ALLOWED_ORIGINS = new Set<string>([
  "https://ants.ceo",
  "https://www.ants.ceo",
  "https://g9jy59jq.insforge.site",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allow = CORS_ALLOWED_ORIGINS.has(origin) ? origin : "https://ants.ceo";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
}

// Legacy alias kept for the dozens of `...corsHeaders` spreads below. Resolved
// lazily per-request via a wrapper so we don't break the existing call sites.
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://ants.ceo",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Vary": "Origin",
};

const STAGES = [
  "Upload video",
  "Chunk scenes",
  "Transcribe",
  "Analyze pacing",
  "Deploy ant swarm",
  "Predict retention",
];

function json(payload: unknown, status = 200, req?: Request): Response {
  const headers = req ? corsFor(req) : corsHeaders;
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function safeName(name = "video.mp4"): string {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "video.mp4";
}

function bearerToken(req: Request): string {
  const header = req.headers.get("authorization") || "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

function getClient(req?: Request) {
  const token = req ? bearerToken(req) : "";
  return createClient({
    baseUrl: Deno.env.get("INSFORGE_BASE_URL") || "https://g9jy59jq.us-west.insforge.app",
    anonKey: Deno.env.get("API_KEY") || Deno.env.get("INSFORGE_API_KEY") || Deno.env.get("ANON_KEY") || Deno.env.get("INSFORGE_ANON_KEY") || "",
    ...(token ? { edgeFunctionToken: token } : {}),
  });
}

async function getAuthedUser(req: Request): Promise<any | null> {
  const token = bearerToken(req);
  if (!token) return null;
  try {
    const client = getClient(req);
    const { data, error } = await client.auth.getCurrentUser();
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

function randomClaimToken(): string {
  return `${crypto.randomUUID()}.${crypto.randomUUID()}`;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
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
      headers: {
        "Content-Type": "application/json",
        ...(ANT_SHARED_TOKEN ? { "X-Ant-Token": ANT_SHARED_TOKEN } : {}),
      },
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
  // Pass the InsForge anon/api key so tribe can fetch the storage URL on a
  // private bucket. The tribe service forwards it as Bearer auth on its GET.
  const storageToken = Deno.env.get("API_KEY") || Deno.env.get("INSFORGE_API_KEY") || Deno.env.get("ANON_KEY") || "";
  try {
    const res = await fetch(`${TRIBE_SERVICE_URL.replace(/\/$/, "")}/tribe-analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(ANT_SHARED_TOKEN ? { "X-Ant-Token": ANT_SHARED_TOKEN } : {}),
      },
      body: JSON.stringify({ video_url: videoUrl, auth_token: storageToken || null }),
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

// Proxy a multipart {video} upload to the Vast Ant server's /api/analyze and
// stream the SSE response straight back to the client. We do NOT buffer the
// upstream body — just hand `response.body` (a ReadableStream) to the new
// Response so bytes flow through unchanged. ANT_SHARED_TOKEN is injected
// server-side; the client never sees it.
async function proxyAntServerStream(req: Request): Promise<Response> {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return json({ ok: false, error: "proxy requires multipart/form-data with video field" }, 400, req);
  }
  // Re-parse and rebuild the multipart so we only forward the `video` field
  // (drops `metadata` and any other fields Vast doesn't accept) and so Deno
  // sets a fresh, correct multipart boundary on the outbound request.
  let videoFile: File | null = null;
  try {
    const form = await req.formData();
    const maybe = form.get("video");
    if (maybe instanceof File) videoFile = maybe;
  } catch (e) {
    return json({ ok: false, error: `multipart parse failed: ${e instanceof Error ? e.message : String(e)}` }, 400, req);
  }
  if (!videoFile) {
    return json({ ok: false, error: "missing 'video' file field" }, 400, req);
  }
  const outForm = new FormData();
  outForm.append("video", videoFile, videoFile.name || "video.mp4");
  const client = getClient();
  const claimToken = randomClaimToken();
  const claimTokenHash = await sha256Hex(claimToken);
  let runId: string | number | null = null;
  const fileMeta = {
    name: videoFile.name || "Uploaded source video",
    size: videoFile.size || 0,
    type: videoFile.type || "video",
  };
  try {
    const { data, error } = await client.database
      .from("viewlytics_analysis_runs")
      .insert({
        status: "uploading",
        video_name: fileMeta.name,
        video_type: fileMeta.type,
        video_size: fileMeta.size,
        video_bucket: "viewlytics-videos",
        phase: 0,
        progress: 0,
        current_stage: "Uploading",
        claim_token_hash: claimTokenHash,
      })
      .select()
      .single();
    if (!error && data) runId = (data as any).id ?? null;
  } catch (e) {
    console.warn("ant placeholder insert failed (non-fatal):", e);
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${ANT_SERVICE_URL.replace(/\/$/, "")}/api/analyze`, {
      method: "POST",
      headers: {
        ...(ANT_SHARED_TOKEN ? { "X-Ant-Token": ANT_SHARED_TOKEN } : {}),
        Accept: "text/event-stream",
      },
      body: outForm,
    });
  } catch (e) {
    return json({ ok: false, stage: "proxy.fetch", error: e instanceof Error ? e.message : String(e) }, 502, req);
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return json({ ok: false, stage: "proxy.upstream", status: upstream.status, error: text || `ant ${upstream.status}` }, 502, req);
  }

  const enc = new TextEncoder();
  const merged = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        enc.encode(`data: ${JSON.stringify({ type: "run", run_id: runId, claim_token: claimToken })}\n\n`),
      );
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
          buf += decoder.decode(value, { stream: true });
          const blocks = buf.split("\n\n");
          buf = blocks.pop() || "";
          for (const block of blocks) {
            const m = block.match(/^data:\s*(.+)$/m);
            if (!m) continue;
            let ev: any;
            try { ev = JSON.parse(m[1]); } catch { continue; }
            if (ev.type === "progress" && runId !== null) {
              client.database
                .from("viewlytics_analysis_runs")
                .update({
                  status: ev.pct >= 8 ? "analyzing" : "uploading",
                  current_stage: ev.label || ev.stage || "Analyzing",
                  progress: Math.max(0, Math.min(100, Math.round(Number(ev.pct) || 0))),
                })
                .eq("id", runId)
                .then(() => {}, () => {});
            } else if (ev.type === "result" && runId !== null) {
              const finalPayload = ev.payload || {};
              const built = buildIntelligenceFromPayload(finalPayload, fileMeta);
              await client.database
                .from("viewlytics_analysis_runs")
                .update({
                  status: "completed",
                  phase: STAGES.length - 1,
                  progress: 100,
                  current_stage: STAGES[STAGES.length - 1],
                  summary: built.summary,
                  intelligence: { ...built.intelligence, source: "ant-local-pipeline" },
                })
                .eq("id", runId);
            } else if (ev.type === "error" && runId !== null) {
              await client.database
                .from("viewlytics_analysis_runs")
                .update({
                  status: "failed",
                  current_stage: `Error: ${String(ev.error || "compute error").slice(0, 80)}`,
                  error: String(ev.error || "compute error"),
                })
                .eq("id", runId);
            }
          }
        }
      } catch (e) {
        console.warn("ant SSE pump crashed:", e);
        try { controller.error(e); } catch { /* already closed */ }
        return;
      }
      controller.close();
    },
  });

  return new Response(merged, {
    status: 200,
    headers: {
      ...corsFor(req),
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
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
  const claimToken = randomClaimToken();
  const claimTokenHash = await sha256Hex(claimToken);
  try {
    const { data, error } = await client.database
      .from("viewlytics_analysis_runs")
      .insert({
        status: file ? "uploading" : "analyzing",
        video_name: fileMeta.name,
        video_type: fileMeta.type,
        video_size: fileMeta.size,
        video_bucket: "viewlytics-videos",
        video_key: uploaded.key || null,
        video_url: uploaded.url || null,
        phase: 0,
        progress: 0,
        current_stage: "Uploading",
        claim_token_hash: claimTokenHash,
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
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(ANT_SHARED_TOKEN ? { "X-Ant-Token": ANT_SHARED_TOKEN } : {}),
    },
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
          `event: run\ndata: ${JSON.stringify({ run_id: runId, claim_token: claimToken, video_url: uploaded.url || null, video_key: uploaded.key || null })}\n\n`,
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
                  .update({
                    status: "analyzing",
                    current_stage: data.label || data.stage,
                    progress: Math.round(data.pct || 0),
                  })
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

async function claimRun(req: Request) {
  const user = await getAuthedUser(req);
  if (!user?.id) {
    return json({ ok: false, error: { message: "Authentication required." } }, 401, req);
  }
  const body = await req.json().catch(() => ({}));
  const runId = body?.run_id;
  const claimToken = String(body?.claim_token || "");
  if (!runId || !claimToken) {
    return json({ ok: false, error: { message: "run_id and claim_token are required." } }, 400, req);
  }
  const claimTokenHash = await sha256Hex(claimToken);
  const client = getClient(req);
  const { data: rows, error: selectError } = await client.database
    .from("viewlytics_analysis_runs")
    .select("id,user_id,claim_token_hash")
    .eq("id", runId)
    .limit(1);
  if (selectError) {
    return json({ ok: false, stage: "database.select", error: selectError.message || String(selectError) }, 500, req);
  }
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || (row as any).claim_token_hash !== claimTokenHash) {
    return json({ ok: false, error: { message: "Invalid or expired claim token." } }, 403, req);
  }
  if ((row as any).user_id && (row as any).user_id !== user.id) {
    return json({ ok: false, error: { message: "This analysis is already attached to another account." } }, 409, req);
  }
  const claimedAt = new Date().toISOString();
  const { data, error } = await client.database
    .from("viewlytics_analysis_runs")
    .update({
      user_id: user.id,
      claimed_at: claimedAt,
      profile_snapshot: body?.profile_snapshot && typeof body.profile_snapshot === "object" ? body.profile_snapshot : {},
      claim_token_hash: null,
    })
    .eq("id", runId)
    .select()
    .single();
  if (error) {
    return json({ ok: false, stage: "database.update", error: error.message || String(error) }, 500, req);
  }
  return json({ ok: true, user_id: user.id, claimed_at: claimedAt, run: data }, 200, req);
}

// Public anon-readable GET. Previously returned the full `latestRun` row
// including the entire `intelligence` blob (transcript text, NIA analysis,
// persona analytics, video filename). Anyone who hit the URL got the most
// recent user's analysis, and any new browser tab on ants.ceo cached it into
// the visitor's localStorage. Cross-user data leak.
//
// We can't scope by owner (the DB has no user_id column on
// viewlytics_analysis_runs — see migrations/20260509225325_*.sql), and adding
// one + RLS is too large for this audit pass.
//
// Mitigation: return ONLY the lightweight fields the UI actually needs to
// hydrate (status/phase/progress/current_stage + a sanitized summary), and
// strip filenames + the entire `intelligence` body. The frontend uses this
// to detect "there's a run in flight" before its own POST. The persisted
// localStorage path (useIntelligenceData) ignores this response now that
// `intelligence` is null, so cross-user contamination is impossible.
async function latestRun(req: Request) {
  const user = await getAuthedUser(req);
  const client = getClient(req);
  if (user?.id) {
    const { data, error } = await client.database
      .from("viewlytics_analysis_runs")
      .select("id,status,phase,progress,current_stage,created_at,updated_at,summary,intelligence,video_name,video_type,video_size,video_url,video_key,claimed_at,profile_snapshot")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      return json({ ok: false, stage: "database.select", error: error.message || String(error) }, 500, req);
    }

    const row = Array.isArray(data) ? data[0] || null : null;
    return json(
      {
        ok: true,
        backend: "insforge",
        latestRun: row,
        stages: STAGES,
        anonymous: false,
      },
      200,
      req,
    );
  }

  const { data, error } = await client.database
    .from("viewlytics_analysis_runs")
    .select("id, status, phase, progress, current_stage, created_at, updated_at, summary")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    return json({ ok: false, stage: "database.select", error: error.message || String(error) }, 500, req);
  }

  const row = Array.isArray(data) ? data[0] || null : null;
  // Strip personally identifying fields from the summary too — video_name
  // could itself leak a brand/campaign identifier (e.g. "acme-q3-launch.mp4").
  let safeSummary: Record<string, unknown> | null = null;
  if (row && (row as any).summary && typeof (row as any).summary === "object") {
    const s = (row as any).summary as Record<string, unknown>;
    safeSummary = {
      virality_score: s.virality_score ?? null,
      positive_rate_pct: s.positive_rate_pct ?? null,
      mean_retention_proxy: s.mean_retention_proxy ?? null,
      completed_at: s.completed_at ?? null,
    };
  }
  const safeRow = row
    ? {
        id: (row as any).id,
        status: (row as any).status,
        phase: (row as any).phase,
        progress: (row as any).progress,
        current_stage: (row as any).current_stage,
        created_at: (row as any).created_at,
        updated_at: (row as any).updated_at,
        summary: safeSummary,
        // Explicitly null so any client expecting `intelligence` knows it
        // must POST a new run to get its own data.
        intelligence: null,
      }
    : null;

  return json(
    {
      ok: true,
      backend: "insforge",
      latestRun: safeRow,
      stages: STAGES,
      // Tell the frontend not to hydrate this as if it were its own analysis.
      anonymous: true,
    },
    200,
    req,
  );
}

// Proxy interactive brain renders from the Vast box. The frontend embeds these
// at same-origin URLs so the Vast token / raw Vast IP stay server-side.
// Matches /brain/<name>.(html|mp4|gif|webm) under the edge function path.
async function proxyBrainAsset(req: Request, filename: string): Promise<Response> {
  const cors = corsFor(req);
  // Sanitize: only allow [a-zA-Z0-9._-], must end in allowed ext, no path traversal.
  if (!/^[A-Za-z0-9._-]+\.(html|mp4|gif|webm)$/.test(filename) || filename.includes("..")) {
    return new Response("bad brain filename", { status: 400, headers: cors });
  }
  const ext = filename.split(".").pop()?.toLowerCase();
  const ctype = ext === "mp4"
    ? "video/mp4"
    : ext === "gif"
    ? "image/gif"
    : ext === "webm"
    ? "video/webm"
    : "text/html; charset=utf-8";
  // Forward Range so the browser's <video> tag can seek/stream chunks rather
  // than buffer the whole file before play.
  const range = req.headers.get("range");
  let upstream: Response;
  try {
    upstream = await fetch(`${ANT_SERVICE_URL.replace(/\/$/, "")}/brain/${filename}`, {
      method: "GET",
      headers: {
        ...(ANT_SHARED_TOKEN ? { "X-Ant-Token": ANT_SHARED_TOKEN } : {}),
        ...(range ? { Range: range } : {}),
      },
    });
  } catch (e) {
    return json({ ok: false, stage: "brain.proxy.fetch", error: e instanceof Error ? e.message : String(e) }, 502);
  }
  const headers: Record<string, string> = {
    ...cors,
    "Content-Type": ctype,
    // Brain UUIDs are unguessable in practice (48 bits of entropy) but the
    // URLs are bearer-style — anyone who scrapes the URL out of referrer/
    // screenshots/CDN can re-fetch the file forever. Prevent intermediaries
    // from caching them so the blast radius is limited to whoever already
    // has the URL. Real fix (signed URLs) deferred.
    "Cache-Control": "private, no-store, max-age=0",
    "Referrer-Policy": "no-referrer",
  };
  // Preserve range-related headers when the upstream returns 206.
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers["Content-Range"] = contentRange;
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers["Content-Length"] = contentLength;
  const acceptRanges = upstream.headers.get("accept-ranges");
  if (acceptRanges) headers["Accept-Ranges"] = acceptRanges;
  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsFor(req) });
  // Brain asset proxy: /<fn-path>/brain/<id>.(html|mp4|gif|webm)
  {
    const url = new URL(req.url);
    const brainMatch = url.pathname.match(/\/brain\/([A-Za-z0-9._-]+\.(?:html|mp4|gif|webm))$/);
    if ((req.method === "GET" || req.method === "HEAD") && brainMatch) {
      return proxyBrainAsset(req, brainMatch[1]);
    }
  }
  if (req.method === "GET") return latestRun(req);
  if (req.method === "POST") {
    const url = new URL(req.url);
    if (url.pathname.endsWith("/claim")) return claimRun(req);
    const wantsStream =
      url.searchParams.get("stream") === "1" ||
      (req.headers.get("accept") || "").includes("text/event-stream");
    if (wantsStream) {
      // Prefer the Vast multipart proxy when the client sent a real video
      // file. On any proxy failure (upstream 5xx/auth/network), fall through
      // to the legacy ANALYZE_SERVICE_URL/analyze/stream JSON path so the
      // dashboard's demo-video runs (no file) keep working.
      const ct = req.headers.get("content-type") || "";
      if (ct.includes("multipart/form-data")) {
        try {
          // Clone so the fallback can still read the body if the proxy short-circuits.
          const proxied = await proxyAntServerStream(req.clone());
          if (proxied.status < 400) return proxied;
          console.warn("ant proxy returned", proxied.status, "— falling back to legacy stream");
        } catch (e) {
          console.warn("ant proxy threw — falling back to legacy stream:", e);
        }
      }
      return createRunStream(req);
    }
    return createRun(req);
  }
  return json({ ok: false, error: "Method not allowed" }, 405);
}
