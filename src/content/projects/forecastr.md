---
title: forecastr
description: Time-series forecasting toolkit with backtesting built in.
pubDate: '2026-04-20'
color: success
icon: ti-timeline
tech:
  - python
  - pytorch
repo: 'https://github.com/'
demo: 'https://example.com/'
featured: true
draft: false
---

## The problem

Most forecasting code couples the model to a single evaluation script, so
comparing approaches means rewriting the harness every time.

## The approach

`forecastr` separates the model from the backtester. Any model implementing a
two-method interface plugs into a rolling-origin evaluation that reports error
bands, not just point estimates.

## Result

Swapping between ARIMA, gradient boosting, and a small temporal CNN is a
one-line change, benchmarked on the same folds.
