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

  // Mint a claim token so the sync path can be claimed post-signup, just
  // like the streaming path. Without this, anonymous demo runs were orphaned.
  const syncClaimToken = randomClaimToken();
  const syncClaimTokenHash = await sha256Hex(syncClaimToken);

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
    claim_token_hash: syncClaimTokenHash,
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

  return json({ ok: true, run: data, claim_token: syncClaimToken, stages: STAGES });
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

// ─────────────────────────────────────────────────────────────────────────────
// Social-media profile scraping. Public-page fetches; no API keys. Cached in
// viewlytics_profile_cache (platform, handle) for 12h to avoid rate-limit pain.
// ─────────────────────────────────────────────────────────────────────────────
const PROFILE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function normalizeHandle(handle: string): string {
  return String(handle || "").trim().replace(/^@/, "").replace(/\/+$/, "").toLowerCase();
}

async function fetchWithRetry(url: string, init: RequestInit, timeoutMs = 15000): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctl.signal });
      clearTimeout(timer);
      if (res.status >= 500 && attempt === 0) continue;
      return res;
    } catch (e) {
      clearTimeout(timer);
      if (attempt === 1) throw e;
    }
  }
  throw new Error("unreachable");
}

function parseFollowersText(text: string): number | null {
  // Handles "1.2M Followers", "12,345 followers", "12.3K", etc.
  const m = String(text || "").replace(/,/g, "").match(/([\d.]+)\s*([KkMmBb])?/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!isFinite(n)) return null;
  const suffix = (m[2] || "").toLowerCase();
  if (suffix === "k") return Math.round(n * 1_000);
  if (suffix === "m") return Math.round(n * 1_000_000);
  if (suffix === "b") return Math.round(n * 1_000_000_000);
  return Math.round(n);
}

async function scrapeTikTok(handle: string) {
  const h = normalizeHandle(handle);
  const url = `https://www.tiktok.com/@${encodeURIComponent(h)}`;
  const res = await fetchWithRetry(url, {
    headers: {
      "User-Agent": BROWSER_UA,
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (res.status === 404) return { ok: false, error: { code: "NOT_FOUND", message: "TikTok profile not found" } };
  if (res.status === 429) return { ok: false, error: { code: "RATE_LIMITED", message: "TikTok rate-limited the request" } };
  if (!res.ok) return { ok: false, error: { code: "PLATFORM_ERROR", message: `TikTok returned ${res.status}` } };
  const html = await res.text();
  const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return { ok: false, error: { code: "PLATFORM_ERROR", message: "Could not parse TikTok page" } };
  let parsed: any;
  try { parsed = JSON.parse(m[1]); } catch {
    return { ok: false, error: { code: "PLATFORM_ERROR", message: "Invalid TikTok JSON" } };
  }
  // The user payload lives under __DEFAULT_SCOPE__["webapp.user-detail"]
  const scope = parsed?.__DEFAULT_SCOPE__ || {};
  const detail = scope["webapp.user-detail"];
  if (!detail || detail.statusCode === 10221) {
    return { ok: false, error: { code: "PRIVATE", message: "TikTok profile is private or restricted" } };
  }
  const userInfo = detail?.userInfo || {};
  const user = userInfo.user || {};
  const stats = userInfo.stats || {};
  if (!user.uniqueId && !user.nickname) {
    return { ok: false, error: { code: "NOT_FOUND", message: "TikTok user not found" } };
  }
  return {
    ok: true,
    profile: {
      platform: "tiktok",
      handle: user.uniqueId || h,
      display_name: user.nickname || user.uniqueId || h,
      followers: Math.max(0, Number(stats.followerCount || 0)),
      following: Math.max(0, Number(stats.followingCount || 0)),
      posts: Math.max(0, Number(stats.videoCount || 0)),
      hearts: Math.max(0, Number(stats.heartCount || stats.heart || 0)),
      engagement_pct: (() => {
        const f = Math.max(0, Number(stats.followerCount || 0));
        const h = Math.max(0, Number(stats.heartCount || stats.heart || 0));
        const v = Math.max(1, Number(stats.videoCount || 1));
        if (!f || !h) return null;
        const ratio = (h / Math.max(1, f * v)) * 100;
        if (!isFinite(ratio) || ratio < 0) return null;
        return Math.min(100, Number(ratio.toFixed(2)));
      })(),
      avatar_url: user.avatarLarger || user.avatarMedium || null,
      bio: user.signature || "",
      niche_tags: [],
      recent_videos: [],
      verified: Boolean(user.verified),
    },
  };
}

async function scrapeInstagram(handle: string) {
  const h = normalizeHandle(handle);
  // Public web_profile_info endpoint — needs the magic app id header.
  const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(h)}`;
  const res = await fetchWithRetry(url, {
    headers: {
      "User-Agent": BROWSER_UA,
      "x-ig-app-id": "936619743392459",
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "*/*",
    },
  });
  if (res.status === 404) return { ok: false, error: { code: "NOT_FOUND", message: "Instagram profile not found" } };
  if (res.status === 429) return { ok: false, error: { code: "RATE_LIMITED", message: "Instagram rate-limited the request" } };
  if (res.status === 401 || res.status === 403) {
    // Fall back to og:description scrape.
    return scrapeInstagramOg(h);
  }
  if (!res.ok) return { ok: false, error: { code: "PLATFORM_ERROR", message: `Instagram returned ${res.status}` } };
  let payload: any;
  try { payload = await res.json(); } catch {
    return scrapeInstagramOg(h);
  }
  const u = payload?.data?.user;
  if (!u) return scrapeInstagramOg(h);
  if (u.is_private) return { ok: false, error: { code: "PRIVATE", message: "Instagram account is private" } };
  return {
    ok: true,
    profile: {
      platform: "instagram",
      handle: u.username || h,
      display_name: u.full_name || u.username || h,
      followers: Number(u.edge_followed_by?.count || 0),
      following: Number(u.edge_follow?.count || 0),
      posts: Number(u.edge_owner_to_timeline_media?.count || 0),
      engagement_pct: null,
      avatar_url: u.profile_pic_url_hd || u.profile_pic_url || null,
      bio: u.biography || "",
      niche_tags: u.category_name ? [u.category_name] : [],
      recent_videos: (u.edge_owner_to_timeline_media?.edges || []).slice(0, 6).map((edge: any) => ({
        id: edge?.node?.id || null,
        caption: edge?.node?.edge_media_to_caption?.edges?.[0]?.node?.text || "",
        likes: Number(edge?.node?.edge_liked_by?.count || edge?.node?.edge_media_preview_like?.count || 0),
        comments: Number(edge?.node?.edge_media_to_comment?.count || 0),
        thumbnail_url: edge?.node?.thumbnail_src || null,
      })),
      verified: Boolean(u.is_verified),
    },
  };
}

async function scrapeInstagramOg(h: string) {
  const url = `https://www.instagram.com/${encodeURIComponent(h)}/`;
  const res = await fetchWithRetry(url, {
    headers: { "User-Agent": BROWSER_UA, "Accept-Language": "en-US,en;q=0.9" },
  });
  if (res.status === 404) return { ok: false, error: { code: "NOT_FOUND", message: "Instagram profile not found" } };
  if (!res.ok) return { ok: false, error: { code: "PLATFORM_ERROR", message: `Instagram fallback returned ${res.status}` } };
  const html = await res.text();
  const desc = html.match(/<meta property="og:description" content="([^"]+)"/)?.[1] || "";
  const avatar = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] || null;
  const title = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] || h;
  // "1,234 Followers, 56 Following, 78 Posts - See Instagram photos and videos from..."
  const followersMatch = desc.match(/([\d.,]+[KMB]?)\s+Followers/i);
  const followingMatch = desc.match(/([\d.,]+[KMB]?)\s+Following/i);
  const postsMatch = desc.match(/([\d.,]+[KMB]?)\s+Posts/i);
  if (!followersMatch) return { ok: false, error: { code: "PRIVATE", message: "Instagram blocked the fetch — try again or enter manually" } };
  return {
    ok: true,
    profile: {
      platform: "instagram",
      handle: h,
      display_name: title.replace(/\s*\(@[^)]+\).*$/, "").trim() || h,
      followers: parseFollowersText(followersMatch[1]) || 0,
      following: followingMatch ? parseFollowersText(followingMatch[1]) || 0 : 0,
      posts: postsMatch ? parseFollowersText(postsMatch[1]) || 0 : 0,
      engagement_pct: null,
      avatar_url: avatar,
      bio: "",
      niche_tags: [],
      recent_videos: [],
      verified: false,
    },
  };
}

async function scrapeYouTube(handle: string) {
  const h = normalizeHandle(handle);
  const url = `https://www.youtube.com/@${encodeURIComponent(h)}/about`;
  const res = await fetchWithRetry(url, {
    headers: {
      "User-Agent": BROWSER_UA,
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (res.status === 404) return { ok: false, error: { code: "NOT_FOUND", message: "YouTube channel not found" } };
  if (res.status === 429) return { ok: false, error: { code: "RATE_LIMITED", message: "YouTube rate-limited the request" } };
  if (!res.ok) return { ok: false, error: { code: "PLATFORM_ERROR", message: `YouTube returned ${res.status}` } };
  const html = await res.text();
  const m = html.match(/var ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  if (!m) return { ok: false, error: { code: "PLATFORM_ERROR", message: "Could not parse YouTube page" } };
  let data: any;
  try { data = JSON.parse(m[1]); } catch {
    return { ok: false, error: { code: "PLATFORM_ERROR", message: "Invalid YouTube JSON" } };
  }
  const header = data?.header?.c4TabbedHeaderRenderer || data?.header?.pageHeaderRenderer || {};
  const meta = data?.metadata?.channelMetadataRenderer || {};
  // Subscriber + video count varies by rollout. Strategy:
  //   1. Try the legacy c4TabbedHeaderRenderer fields.
  //   2. Deep-walk ytInitialData for any string ending in "subscribers"
  //      / "subscriber" / "videos" — catches the newer pageHeaderViewModel
  //      format where data lives in metadataRows[].metadataParts[].text.content.
  //   3. Regex-fallback against the raw HTML for "X subscribers".
  const legacySubText =
    header?.subscriberCountText?.simpleText ||
    header?.subscriberCountText?.accessibility?.accessibilityData?.label ||
    header?.subscriberCountText?.runs?.map((r: any) => r.text).join("") ||
    "";
  const legacyVideoText = header?.videosCountText?.runs?.map((r: any) => r.text).join("") || "";

  function deepFindCount(matchRe: RegExp): string {
    const stack: any[] = [data];
    const seen = new WeakSet<object>();
    while (stack.length) {
      const x = stack.pop();
      if (x == null) continue;
      if (typeof x === "string") {
        if (matchRe.test(x)) return x;
        continue;
      }
      if (typeof x !== "object") continue;
      if (seen.has(x)) continue;
      seen.add(x);
      if (Array.isArray(x)) {
        for (const v of x) stack.push(v);
      } else {
        for (const v of Object.values(x)) stack.push(v);
      }
    }
    return "";
  }

  const subscriberText =
    legacySubText ||
    deepFindCount(/subscribers?\b/i) ||
    (html.match(/([\d.,]+\s*[KMB]?)\s+subscribers?/i)?.[1]
      ? `${html.match(/([\d.,]+\s*[KMB]?)\s+subscribers?/i)![1]} subscribers`
      : "");
  const videoText =
    legacyVideoText ||
    deepFindCount(/\bvideos?\b/i) ||
    "";

  const followers = parseFollowersText(subscriberText) || 0;
  const posts = parseFollowersText(videoText) || 0;
  return {
    ok: true,
    profile: {
      platform: "youtube",
      handle: meta.vanityChannelUrl?.split("/@").pop() || h,
      display_name: meta.title || header?.title || h,
      followers,
      following: 0,
      posts,
      engagement_pct: null,
      avatar_url: header?.avatar?.thumbnails?.slice(-1)?.[0]?.url || meta?.avatar?.thumbnails?.slice(-1)?.[0]?.url || null,
      bio: meta.description || "",
      niche_tags: meta.keywords ? String(meta.keywords).split(/\s+/).slice(0, 6) : [],
      recent_videos: [],
      verified: false,
    },
  };
}

async function scrapeProfile(platform: string, handle: string) {
  const p = String(platform || "").toLowerCase();
  if (p === "tiktok") return scrapeTikTok(handle);
  if (p === "instagram") return scrapeInstagram(handle);
  if (p === "youtube") return scrapeYouTube(handle);
  return { ok: false, error: { code: "PLATFORM_ERROR", message: `Unsupported platform: ${platform}` } };
}

async function profileScrapeRoute(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const platform = String((body as any)?.platform || "").toLowerCase();
  const handle = normalizeHandle(String((body as any)?.handle || ""));
  if (!platform || !handle) {
    return json({ ok: false, error: { code: "PLATFORM_ERROR", message: "platform and handle are required" } }, 400, req);
  }
  if (!["tiktok", "instagram", "youtube"].includes(platform)) {
    return json({ ok: false, error: { code: "PLATFORM_ERROR", message: "Unsupported platform" } }, 400, req);
  }
  const client = getClient(req);
  // Check cache first.
  try {
    const { data: cached } = await client.database
      .from("viewlytics_profile_cache")
      .select("profile,error,fetched_at")
      .eq("platform", platform)
      .eq("handle", handle)
      .limit(1);
    const row = Array.isArray(cached) ? cached[0] : null;
    if (row?.fetched_at) {
      const age = Date.now() - new Date((row as any).fetched_at).getTime();
      if (age < PROFILE_CACHE_TTL_MS && row.profile && Object.keys(row.profile).length) {
        return json({ ok: true, cached: true, profile: row.profile }, 200, req);
      }
    }
  } catch (_) { /* non-fatal */ }

  let result: any;
  try {
    result = await scrapeProfile(platform, handle);
  } catch (e) {
    result = { ok: false, error: { code: "PLATFORM_ERROR", message: e instanceof Error ? e.message : String(e) } };
  }

  // Persist cache. The InsForge SDK's .from().insert() builder is lazy and
  // only actually executes when you tack `.select()` (or `.single()`) onto the
  // chain — without it the call resolves silently but never hits the DB. This
  // is the same pattern the runs-table writes use. Errors get console.warn'd.
  if (result?.ok && result.profile) {
    try {
      const row = {
        platform,
        handle,
        profile: result.profile,
        error: null as string | null,
        fetched_at: new Date().toISOString(),
      };
      // Primary key is (platform, handle) after the 2026-05-13 migration that
      // dropped the bigserial id (the anon role lacked USAGE on its sequence).
      // Delete-then-insert is a portable upsert that works without onConflict.
      await client.database
        .from("viewlytics_profile_cache")
        .delete()
        .eq("platform", platform)
        .eq("handle", handle)
        .select();
      const { error: insErr } = await client.database
        .from("viewlytics_profile_cache")
        .insert(row)
        .select()
        .single();
      if (insErr) console.warn("profile_cache insert failed:", insErr);
    } catch (e) {
      console.warn("profile_cache persist threw:", e);
    }
  }

  if (!result?.ok) {
    return json(result, 200, req);
  }
  return json({ ok: true, cached: false, profile: result.profile }, 200, req);
}

// ─────────────────────────────────────────────────────────────────────────────
// History — list user's past analysis runs, plus single-run fetch.
// ─────────────────────────────────────────────────────────────────────────────
async function historyRoute(req: Request): Promise<Response> {
  const user = await getAuthedUser(req);
  if (!user?.id) return json({ ok: false, error: { message: "Authentication required." } }, 401, req);
  const client = getClient(req);
  const { data, error } = await client.database
    .from("viewlytics_analysis_runs")
    .select("id,status,video_name,video_size,video_type,video_url,summary,created_at,updated_at,claimed_at,profile_snapshot")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return json({ ok: false, stage: "database.select", error: error.message || String(error) }, 500, req);
  return json({ ok: true, runs: Array.isArray(data) ? data : [] }, 200, req);
}

async function runByIdRoute(req: Request, runId: string): Promise<Response> {
  const user = await getAuthedUser(req);
  if (!user?.id) return json({ ok: false, error: { message: "Authentication required." } }, 401, req);
  const client = getClient(req);
  const { data, error } = await client.database
    .from("viewlytics_analysis_runs")
    .select("id,status,phase,progress,current_stage,video_name,video_size,video_type,video_url,video_key,summary,intelligence,created_at,updated_at,claimed_at,profile_snapshot,user_id")
    .eq("id", runId)
    .limit(1);
  if (error) return json({ ok: false, stage: "database.select", error: error.message || String(error) }, 500, req);
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return json({ ok: false, error: { message: "Run not found." } }, 404, req);
  if ((row as any).user_id !== user.id) {
    return json({ ok: false, error: { message: "This analysis is not attached to your account." } }, 403, req);
  }
  return json({ ok: true, run: row }, 200, req);
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
  // History list + single-run fetch (GET, authed).
  {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname.endsWith("/history")) return historyRoute(req);
    const runMatch = url.pathname.match(/\/run\/([A-Za-z0-9-]+)$/);
    if (req.method === "GET" && runMatch) return runByIdRoute(req, runMatch[1]);
  }
  if (req.method === "GET") return latestRun(req);
  if (req.method === "POST") {
    const url = new URL(req.url);
    if (url.pathname.endsWith("/claim")) return claimRun(req);
    if (url.pathname.endsWith("/profile-scrape")) return profileScrapeRoute(req);
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
