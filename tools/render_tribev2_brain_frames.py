from __future__ import annotations

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import LinearSegmentedColormap
from nilearn import datasets, plotting


APP_ROOT = Path(__file__).resolve().parents[1]
ANT_ROOT = APP_ROOT.parent / "Ant"
GEOMETRY_JSON = ANT_ROOT / "cache" / "brain_geometry_nodes_video.json"
OUT_DIR = APP_ROOT / "public" / "assets" / "tribev2"


def frame_to_surface(frame: dict, hemi_vertices: int) -> tuple[np.ndarray, np.ndarray]:
    left = np.zeros(hemi_vertices, dtype=np.float32)
    right = np.zeros(hemi_vertices, dtype=np.float32)
    for vertex in frame.get("vertices", []):
        index = int(vertex.get("global_vertex_index", 0))
        value = float(vertex.get("activation_abs_norm_0_to_1", 0.0))
        if index < hemi_vertices:
            left[index] = value
        else:
            right[index - hemi_vertices] = value
    return left, right


def main() -> None:
    payload = json.loads(GEOMETRY_JSON.read_text(encoding="utf-8"))
    timesteps = payload.get("timesteps", [])
    _, total_vertices = payload.get("shape_timesteps_vertices", [0, 20484])
    hemi_vertices = int(total_vertices) // 2
    fsaverage = datasets.fetch_surf_fsaverage(mesh="fsaverage5")
    cmap = LinearSegmentedColormap.from_list(
        "tribe_fire",
        [
            (0.0, "#1b0b08"),
            (0.34, "#8f1d12"),
            (0.66, "#f08a1b"),
            (0.88, "#ffd84a"),
            (1.0, "#fff8d0"),
        ],
    )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for stale in OUT_DIR.glob("brain-frame-*.png"):
        stale.unlink()

    selected = list(range(0, len(timesteps), 2))
    if selected[-1] != len(timesteps) - 1:
        selected.append(len(timesteps) - 1)

    manifest = []
    for output_index, timestep_index in enumerate(selected):
        frame = timesteps[timestep_index]
        left, right = frame_to_surface(frame, hemi_vertices)
        fig = plt.figure(figsize=(8, 3.2), facecolor="none")
        for plot_index, (hemi, data) in enumerate((("left", left), ("right", right)), start=1):
            ax = fig.add_subplot(1, 2, plot_index, projection="3d")
            plotting.plot_surf_stat_map(
                fsaverage[f"infl_{hemi}"],
                data,
                hemi=hemi,
                view="lateral",
                cmap=cmap,
                threshold=0.14,
                bg_map=fsaverage[f"sulc_{hemi}"],
                bg_on_data=True,
                colorbar=False,
                axes=ax,
                figure=fig,
                vmax=1,
                vmin=0,
            )
            ax.set_facecolor((1, 1, 1, 0))
        fig.subplots_adjust(0, 0, 1, 1, wspace=-0.18)
        filename = f"brain-frame-{output_index:02d}.png"
        out_path = OUT_DIR / filename
        fig.savefig(out_path, dpi=180, transparent=True, bbox_inches="tight", pad_inches=0)
        plt.close(fig)
        manifest.append(
            {
                "src": f"/assets/tribev2/{filename}",
                "timestep_index": int(frame.get("timestep_index", timestep_index)),
                "time_sec": round(float(frame.get("time_window_start_sec", 0.0)), 2),
            }
        )
        print(f"wrote {out_path}")

    (OUT_DIR / "brain-frames.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"wrote {OUT_DIR / 'brain-frames.json'}")


if __name__ == "__main__":
    main()
