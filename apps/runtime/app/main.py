from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__

app = FastAPI(title="SEO runtime", version=__version__)

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
extra = os.getenv("CORS_ORIGIN", "")
if extra:
    origins.append(extra.rstrip("/"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str | bool]:
    org = os.getenv("ORG_ID", "")
    suffix = org[-6:] if len(org) >= 6 else org
    return {
        "ok": True,
        "version": __version__,
        "org_id_suffix": suffix,
    }
