"use strict";

(function exposeReviewDraft(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GT63ReviewDraft = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createReviewDraftApi() {
  const REVIEW_DRAFT_KEYS = [
    "approvedModel",
    "hasManualEdits",
    "originalModel",
    "reviewedModel",
    "status"
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value ?? null));
  }

  function sameModel(a, b) {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  }

  function assertReviewDraft(state = {}) {
    const keys = Object.keys(state || {}).sort();
    if (JSON.stringify(keys) !== JSON.stringify(REVIEW_DRAFT_KEYS)) {
      throw new Error("Unsupported review draft shape");
    }
    if (!["draft", "approved"].includes(state.status)) {
      throw new Error("Unsupported review draft status");
    }
    return state;
  }

  function createReviewDraft(productModel = {}) {
    const originalModel = clone(productModel);
    const reviewedModel = clone(productModel);
    return assertReviewDraft({
      originalModel,
      reviewedModel,
      approvedModel: null,
      hasManualEdits: false,
      status: "draft"
    });
  }

  function updateReviewedModel(state = {}, reviewedModel = {}) {
    const originalModel = clone(state.originalModel);
    const nextReviewedModel = clone(reviewedModel);
    return assertReviewDraft({
      originalModel,
      reviewedModel: nextReviewedModel,
      approvedModel: null,
      hasManualEdits: !sameModel(originalModel, nextReviewedModel),
      status: "draft"
    });
  }

  function approveReviewedModel(state = {}, reviewedModel = state.reviewedModel) {
    const originalModel = clone(state.originalModel);
    const nextReviewedModel = clone(reviewedModel);
    return assertReviewDraft({
      originalModel,
      reviewedModel: nextReviewedModel,
      approvedModel: clone(nextReviewedModel),
      hasManualEdits: !sameModel(originalModel, nextReviewedModel),
      status: "approved"
    });
  }

  function activeProductModel(state = {}) {
    return clone(state.approvedModel || state.reviewedModel || state.originalModel);
  }

  return {
    createReviewDraft,
    updateReviewedModel,
    approveReviewedModel,
    activeProductModel,
    assertReviewDraft
  };
});
