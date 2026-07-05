---
title: "docuchat"
description: "RAG assistant that cites its sources from your own PDFs."
pubDate: 2026-03-02
color: accent
icon: ti-message-chatbot
tech: [llm, rag]
repo: https://github.com/
demo: https://example.com/
featured: true
---

## The problem

Chat-over-your-docs demos are everywhere, but most hallucinate and none show
their work.

## The approach

`docuchat` grounds every answer in retrieved chunks and renders inline citations
that link back to the exact page. If retrieval finds nothing, it says so instead
of guessing.

## Result

A trustworthy document assistant you can actually audit — every claim traces to a
source.
