"""2×384 embedding autoencoder (transcript + summary), row-tied linears, per-stage activations."""

from __future__ import annotations

import torch
import torch.nn as nn

from .persona_compressor import SharedElementwiseActivation


class EmbeddingPairAE(nn.Module):
    """Stack two 384-d embeddings as [B, 2, 384].

    Same ``nn.Linear`` is applied to each row (last dim). After every linear map,
    apply the custom element-wise activation; **each stage has its own** activation
    parameters (shared only within that stage across all elements of the tensor).

    2×384 → 2×128 → 2×64 → 2×32 → 2×64 → 2×128 → 2×384.
    """

    def __init__(self) -> None:
        super().__init__()
        self.lin1 = nn.Linear(384, 128)
        self.lin2 = nn.Linear(128, 64)
        self.lin3 = nn.Linear(64, 32)
        self.lin4 = nn.Linear(32, 64)
        self.lin5 = nn.Linear(64, 128)
        self.lin6 = nn.Linear(128, 384)
        self.act1 = SharedElementwiseActivation()
        self.act2 = SharedElementwiseActivation()
        self.act3 = SharedElementwiseActivation()
        self.act4 = SharedElementwiseActivation()
        self.act5 = SharedElementwiseActivation()
        self.act6 = SharedElementwiseActivation()

    def encode(self, x: torch.Tensor) -> torch.Tensor:
        h = self.act1(self.lin1(x))
        h = self.act2(self.lin2(h))
        return self.act3(self.lin3(h))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = self.act1(self.lin1(x))
        h = self.act2(self.lin2(h))
        z = self.act3(self.lin3(h))
        h = self.act4(self.lin4(z))
        h = self.act5(self.lin5(h))
        return self.act6(self.lin6(h))
