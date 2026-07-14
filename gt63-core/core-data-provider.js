"use strict";

(function exposeCoreDataProvider(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GT63CoreDataProvider = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCoreDataProvider(root) {
  const PRODUCT_KEYS = ["blockingIssues", "flight", "hotel", "readiness", "warnings"];

  function getAdapter() {
    if (root.GT63SmartImportConsumerAdapter?.adaptSmartImportForProduct) {
      return root.GT63SmartImportConsumerAdapter;
    }
    if (typeof require === "function") {
      return require("./smart-import-consumer-adapter");
    }
    return null;
  }

  function getFetch(fetchImpl) {
    const candidate = fetchImpl || root.fetch;
    if (typeof candidate !== "function") {
      throw new Error("Fetch unavailable");
    }
    return candidate.bind(root);
  }

  function assertProductModelShape(model) {
    const keys = Object.keys(model || {}).sort();
    if (JSON.stringify(keys) !== JSON.stringify(PRODUCT_KEYS)) {
      throw new Error("Provider returned unsupported product model shape");
    }
    if (!["ready", "review"].includes(model.readiness)) {
      throw new Error("Provider returned unsupported readiness");
    }
    if (!Array.isArray(model.warnings) || !Array.isArray(model.blockingIssues)) {
      throw new Error("Provider returned unsupported warning or blocking issue shape");
    }
    return model;
  }

  function adaptContract(contract) {
    const adapter = getAdapter();
    if (!adapter || typeof adapter.adaptSmartImportForProduct !== "function") {
      throw new Error("Smart Import consumer adapter unavailable");
    }
    return assertProductModelShape(adapter.adaptSmartImportForProduct(contract || {}));
  }

  function assertContractVersion(contract) {
    if (!contract || contract.contractVersion !== "1.0") {
      throw new Error("Unsupported contract version");
    }
  }

  function createFixtureProvider(options = {}) {
    const fetchImpl = options.fetchImpl;

    return {
      async loadProductModel(input = {}) {
        const fixtureUrl = input.fixtureUrl || input.url || input;
        if (!fixtureUrl || typeof fixtureUrl !== "string") {
          throw new Error("Fixture Provider requires fixtureUrl");
        }
        const response = await getFetch(fetchImpl)(fixtureUrl, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Fixture load failed (${response.status})`);
        }
        const contract = await response.json();
        assertContractVersion(contract);
        return adaptContract(contract);
      }
    };
  }

  function createLiveSmartImportProvider(options = {}) {
    const endpoint = options.endpoint || "/api/smart-import";
    const fetchImpl = options.fetchImpl;

    return {
      async loadProductModel(input = {}) {
        const response = await getFetch(fetchImpl)(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input.request || input)
        });
        if (!response.ok) {
          throw new Error(`Live Smart Import failed (${response.status})`);
        }
        const contract = await response.json();
        assertContractVersion(contract);
        return adaptContract(contract);
      }
    };
  }

  function createProvider(options = {}) {
    if (options.provider === "live") {
      return createLiveSmartImportProvider(options);
    }
    return createFixtureProvider(options);
  }

  async function loadProductModel(input = {}, options = {}) {
    const provider = options.providerInstance || createProvider({
      ...options,
      provider: input.provider || options.provider || "fixture"
    });
    return provider.loadProductModel(input);
  }

  return {
    createFixtureProvider,
    createLiveSmartImportProvider,
    createProvider,
    loadProductModel
  };
});
