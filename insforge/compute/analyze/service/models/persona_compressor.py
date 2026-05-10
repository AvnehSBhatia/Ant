"""100-d persona autoencoder with shared elementwise activation."""

from __future__ import annotations

import torch
import torch.nn as nn


class SharedElementwiseActivation(nn.Module):
    """Element-wise activation (same learnable scalars at every use).

    phi(x) = atan2(sqrt(clamp(1-(b*x)^2)), b*x) + c*sin^3(d*x) + f_lin*x + g*(x-h)^2 + m

    The user formula used ``f`` for the linear term; we name it ``f_lin`` to avoid
    colliding with the module's ``forward``.
    """

    def __init__(self, eps: float = 1e-6) -> None:
        super().__init__()
        self.eps = eps
        self.b = nn.Parameter(torch.tensor(1.0))
        self.c = nn.Parameter(torch.tensor(0.05))
        self.d = nn.Parameter(torch.tensor(1.0))
        self.f_lin = nn.Parameter(torch.tensor(0.1))
        self.g = nn.Parameter(torch.tensor(0.02))
        self.h = nn.Parameter(torch.tensor(0.0))
        self.m = nn.Parameter(torch.tensor(0.0))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        bx = self.b * x
        u = torch.clamp(bx, -1.0 + self.eps, 1.0 - self.eps)
        inner = torch.clamp(1.0 - u * u, min=self.eps)
        term_atan2 = torch.atan2(torch.sqrt(inner), u)
        s = torch.sin(self.d * x)
        term_sin = self.c * (s * s * s)
        term_lin = self.f_lin * x
        term_quad = self.g * (x - self.h) ** 2
        return term_atan2 + term_sin + term_lin + term_quad + self.m


class PersonaCompressorAE(nn.Module):
    """100 -> (act) -> 64 -> (act) -> 32 -> (act) -> 64 -> (act) -> 100."""

    def __init__(self) -> None:
        super().__init__()
        self.act = SharedElementwiseActivation()
        self.enc1 = nn.Linear(100, 64)
        self.enc2 = nn.Linear(64, 32)
        self.dec1 = nn.Linear(32, 64)
        self.dec2 = nn.Linear(64, 100)

    def encode(self, x: torch.Tensor) -> torch.Tensor:
        h = self.act(self.enc1(x))
        z = self.act(self.enc2(h))
        return z

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = self.act(self.enc1(x))
        z = self.act(self.enc2(h))
        h2 = self.act(self.dec1(z))
        out = self.act(self.dec2(h2))
        return out
