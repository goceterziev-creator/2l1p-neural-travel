"use strict";

const assert = require("node:assert/strict");
const vm = require("../gt63-core/presentation-view-model");

assert.equal(vm.compactMealLabel("Breakfast and dinner"), "Закуска и вечеря");
assert.equal(vm.compactMealLabel("Закуска и вечеря"), "Закуска и вечеря");
assert.equal(vm.compactMealLabel("Breakfast included"), "Закуска");
assert.equal(vm.compactMealLabel("Half board"), "Полупансион");
assert.equal(vm.compactMealLabel(""), "Хранене за потвърждение");
assert.equal(vm.resolvedMealPlan({ meal: "Breakfast and dinner" }), "Закуска и вечеря");
assert.equal(vm.buildPresentationViewModel({ hotelOptions: [{ id: "h1", meal: "Breakfast and dinner" }] }).selectedMealPlan, "Закуска и вечеря");
console.log("AYA-04 meal label regression: PASS");
