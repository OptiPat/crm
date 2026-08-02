#!/usr/bin/env python3
"""Répare Cargo.toml : supprime la ligne 44 corrompue (commentaire profile.dev)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CARGO = ROOT / "src-tauri" / "Cargo.toml"

DEV_COMMENT = (
    "# debug = 0 — evite LNK1318 ; codegen-units reduisent le pic memoire LLVM sous Windows."
)

data = CARGO.read_bytes()
lines = data.split(b"\n")
out: list[bytes] = []
i = 0
while i < len(lines):
    line = lines[i]
  # skip the corrupted mega-line (starts with profile.dev comment prefix)
    if line.startswith(b"# debug = 0") and len(line) > 200:
        if out and out[-1].strip() == b"[profile.dev]":
            out.append(DEV_COMMENT.encode("utf-8"))
        i += 1
        continue
    out.append(line)
    i += 1

fixed = b"\n".join(out)
if not fixed.endswith(b"\n"):
    fixed += b"\n"

CARGO.write_bytes(fixed)
print(f"repaired {CARGO} -> {len(fixed)} bytes")
