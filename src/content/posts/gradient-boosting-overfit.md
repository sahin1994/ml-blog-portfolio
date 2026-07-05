---
title: "Why your gradient boosting model quietly overfits"
description: "A tour of leakage, early stopping, and the validation traps that make offline scores lie."
pubDate: 2026-05-28
category: deep-dive
tags: [tabular, python]
---

Gradient boosting is the workhorse of tabular ML — and the easiest place to fool
yourself. The model is powerful enough to memorize, and the usual metrics are
happy to hide it.

## Leakage hides in plain sight

The most common failure isn't the model — it's the data. Target-encoded features
computed over the whole dataset, timestamps that peek into the future, or a join
that pulls in a column derived from the label. The score looks great offline and
collapses in production.

## Early stopping needs a clean holdout

Early stopping is only honest if the validation set it watches is untouched by
feature engineering. Fit your encoders inside the cross-validation fold, not
before it.

The fix is boring and it works: a strict temporal split, encoders fit per-fold,
and a final holdout you look at exactly once.
