"use strict";

(function exposeProposalRendererRegistry(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GT63ProposalRendererRegistry = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createProposalRendererRegistry(root) {
  const TEMPLATE_RENDERERS = {
    "multi-hotel": {
      label: "Multi-Hotel Selector",
      render(input) {
        const renderer = root.GT63MultiHotelRenderer || (typeof require === "function" ? require("./renderers/multi-hotel") : null);
        if (!renderer?.renderMultiHotelProposal) {
          throw new Error("Multi-hotel renderer unavailable");
        }
        return renderer.renderMultiHotelProposal(input);
      }
    },
    "cathedral": {
      label: "Cathedral",
      render: renderWithLuxuryFallback
    },
    "city-discovery": {
      label: "City Discovery",
      render: renderWithLuxuryFallback
    },
    "multi-city": {
      label: "Multi-City Journey",
      render: renderWithLuxuryFallback
    }
  };

  function renderWithLuxuryFallback(input) {
    const renderer = root.GT63LuxuryV11Renderer || (typeof require === "function" ? require("./luxury-v11-renderer") : null);
    if (!renderer?.renderLuxuryProposal) {
      throw new Error("Luxury V11 renderer unavailable");
    }
    return renderer.renderLuxuryProposal(input);
  }

  function selectedTemplate(input = {}) {
    return input.proposalTemplate?.selected || input.proposalTemplate?.recommended || "cathedral";
  }

  function rendererFor(input = {}) {
    const selected = selectedTemplate(input);
    const renderer = TEMPLATE_RENDERERS[selected];
    if (!renderer) {
      throw new Error(`Unsupported proposal template: ${selected}`);
    }
    return renderer;
  }

  function renderProposal(input = {}) {
    return rendererFor(input).render(input);
  }

  function availableTemplates() {
    return Object.entries(TEMPLATE_RENDERERS).map(([value, config]) => ({
      value,
      label: config.label
    }));
  }

  return {
    availableTemplates,
    renderProposal,
    rendererFor,
    selectedTemplate
  };
});
