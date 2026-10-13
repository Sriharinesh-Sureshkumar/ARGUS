---
title: ARGUS
emoji: 🎯
colorFrom: gray
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
---

# ARGUS (backend API)

This Space runs the ARGUS backend API only: a demo of a CS2 player
anomaly-triage ranking tool, not a verdict on any player. Set
`CORS_ORIGINS` (Space secret/variable) to your frontend's real URL
before using it from a browser -- never `*`. History is stored in
this Space's own ephemeral filesystem, so **uploaded analyses are
wiped whenever the Space restarts or redeploys**; nothing here is a
permanent record.
