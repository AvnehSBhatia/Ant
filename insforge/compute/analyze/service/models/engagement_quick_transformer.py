"""Engagement head with modality towers, 5-head fusion attention, and interaction features."""

from __future__ import annotations

import torch
import torch.nn as nn


class ProjectionTower(nn.Module):
    """Normalize one modality, project it to the shared fusion width, then normalize again."""

    def __init__(self, in_dim: int, hidden_dim: int, out_dim: int, dropout: float) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.LayerNorm(in_dim),
            nn.Linear(in_dim, hidden_dim),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, out_dim),
            nn.LayerNorm(out_dim),
            nn.GELU(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class FusionBlock(nn.Module):
    """Pre-norm MHA + pre-norm feed-forward block over the three modality tokens."""

    def __init__(self, d_model: int, n_heads: int, dropout: float) -> None:
        super().__init__()
        self.norm_attn = nn.LayerNorm(d_model)
        self.attn = nn.MultiheadAttention(
            d_model,
            n_heads,
            dropout=dropout,
            batch_first=True,
        )
        self.drop_attn = nn.Dropout(dropout)
        self.norm_ff = nn.LayerNorm(d_model)
        self.ff = nn.Sequential(
            nn.Linear(d_model, 4 * d_model),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(4 * d_model, d_model),
            nn.Dropout(dropout),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        xn = self.norm_attn(x)
        attn_out, _ = self.attn(xn, xn, xn, need_weights=False)
        x = x + self.drop_attn(attn_out)
        return x + self.ff(self.norm_ff(x))


class EngagementConcatMLP(nn.Module):
    """Persona/transcript/summary towers → 5-head attention → concat + interactions → logits."""

    def __init__(
        self,
        d_model: int = 100,
        n_heads: int = 5,
        n_classes: int = 7,
        n_fusion_blocks: int = 1,
        dropout: float = 0.20,
    ) -> None:
        super().__init__()
        if d_model % n_heads != 0:
            raise ValueError(f"d_model ({d_model}) must be divisible by n_heads ({n_heads})")
        self.d_model = d_model
        tower_hidden = max(128, 2 * d_model)
        self.persona_tower = ProjectionTower(100, tower_hidden, d_model, dropout)
        self.transcript_tower = ProjectionTower(384, tower_hidden, d_model, dropout)
        self.summary_tower = ProjectionTower(384, tower_hidden, d_model, dropout)
        self.fusion = nn.ModuleList(
            FusionBlock(d_model, n_heads, dropout) for _ in range(n_fusion_blocks)
        )
        # p, t, s, |t-s|, t*s, p*((t+s)/2)
        classifier_in = 6 * d_model
        cls_h1 = max(128, 2 * d_model)
        cls_h2 = max(96, d_model)
        self.classifier = nn.Sequential(
            nn.LayerNorm(classifier_in),
            nn.Linear(classifier_in, cls_h1),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(cls_h1, cls_h2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(cls_h2, n_classes),
        )

    def forward(
        self,
        persona_vec: torch.Tensor,
        transcript_emb: torch.Tensor,
        summary_emb: torch.Tensor,
    ) -> torch.Tensor:
        p = self.persona_tower(persona_vec)
        t = self.transcript_tower(transcript_emb)
        s = self.summary_tower(summary_emb)
        x = torch.stack([p, t, s], dim=1)
        for block in self.fusion:
            x = block(x)
        p, t, s = x[:, 0, :], x[:, 1, :], x[:, 2, :]
        content = 0.5 * (t + s)
        features = torch.cat([p, t, s, torch.abs(t - s), t * s, p * content], dim=-1)
        return self.classifier(features)


EngagementQuickTransformer = EngagementConcatMLP
