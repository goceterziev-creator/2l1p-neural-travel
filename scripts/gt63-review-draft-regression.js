"use strict";

const assert = require("assert");

const {
  createReviewDraft,
  updateReviewedModel,
  approveReviewedModel,
  activeProductModel,
  assertReviewDraft
} = require("../gt63-core/review-draft");
const {
  buildProposalInputFromProductModel
} = require("../gt63-core/proposal-input-adapter");
const {
  buildOfferPayloadFromProductModel
} = require("../gt63-core/offer-engine-adapter");

const extractedModel = {
  readiness: "ready",
  warnings: [],
  blockingIssues: [],
  flight: {
    airline: "Emirates",
    route: "SOF -> MLE / MLE -> SOF",
    departure: "SOF -> MLE, 31 August",
    arrival: "MLE -> SOF, 15 September",
    baggage: "Not specified",
    notes: "Review flight times before reservation.",
    price: 1475,
    outboundSegments: [
      {
        airline: "Emirates",
        flightNumber: "EK2229",
        from: "SOF",
        to: "DXB",
        departure: "31 August 15:25",
        arrival: "31 August 21:25",
        duration: "5h"
      }
    ],
    inboundSegments: []
  },
  hotel: {
    name: "Patina Maldives",
    area: "Fari Islands, Maldives",
    room: "Beach Villa",
    meal: "Breakfast included",
    price: 11200
  },
  hotelOptions: [
    {
      name: "Patina Maldives",
      area: "Fari Islands, Maldives",
      room: "Beach Villa",
      meal: "Breakfast included",
      price: 11200,
      selected: true
    }
  ]
};

const draft = createReviewDraft(extractedModel);
assertReviewDraft(draft);
assert.equal(draft.status, "draft");
assert.equal(draft.hasManualEdits, false);
assert.equal(draft.originalModel.flight.price, 1475);
assert.equal(draft.reviewedModel.flight.price, 1475);
assert.equal(draft.approvedModel, null);

const editedModel = JSON.parse(JSON.stringify(draft.reviewedModel));
editedModel.flight.price = 1520;
editedModel.flight.baggage = "1 checked bag included";
editedModel.hotelOptions[0].price = 11800;
editedModel.hotelOptions[0].room = "Water Villa";
editedModel.hotel = editedModel.hotelOptions[0];

const editedDraft = updateReviewedModel(draft, editedModel);
assertReviewDraft(editedDraft);
assert.equal(editedDraft.status, "draft");
assert.equal(editedDraft.hasManualEdits, true);
assert.equal(editedDraft.originalModel.flight.price, 1475, "original extraction must remain unchanged after edit");
assert.equal(editedDraft.reviewedModel.flight.price, 1520, "reviewed draft should contain operator correction");
assert.equal(editedDraft.approvedModel, null, "updating draft should not auto-approve");

const approvedDraft = approveReviewedModel(editedDraft);
assertReviewDraft(approvedDraft);
assert.equal(approvedDraft.status, "approved");
assert.equal(approvedDraft.hasManualEdits, true);
assert.equal(approvedDraft.originalModel.flight.price, 1475, "approved draft must preserve original extraction");
assert.equal(approvedDraft.reviewedModel.flight.price, 1520, "approved draft should preserve reviewed correction");
assert.equal(approvedDraft.approvedModel.flight.price, 1520, "approved model should contain operator correction");

const active = activeProductModel(approvedDraft);
assert.equal(active.flight.price, 1520, "active product model should use approved correction");
assert.equal(active.flight.baggage, "1 checked bag included", "active product model should use approved baggage");
assert.equal(active.hotel.price, 11800, "active product model should use approved selected hotel");

const context = {
  clientName: "GT63 Test Client",
  destination: "Maldives",
  travelDates: "31 August - 15 September",
  guests: "2 adults",
  travelers: "2 adults"
};
const previewInput = buildProposalInputFromProductModel(active, context);
const offerPayload = buildOfferPayloadFromProductModel(active, context);

assert.equal(previewInput.flight.price, 1520, "Preview should use approved flight price");
assert.equal(previewInput.flight.baggage, "1 checked bag included", "Preview should use approved baggage");
assert.equal(previewInput.hotel.price, 11800, "Preview should use approved hotel price");
assert.equal(offerPayload.flightPrice, 1520, "Offer Engine should receive approved flight price");
assert.equal(offerPayload.flightBaggage, "1 checked bag included", "Offer Engine should receive approved baggage");
assert.equal(offerPayload.hotelPrice, 11800, "Offer Engine should receive approved hotel price");

const editAgainDraft = updateReviewedModel(approvedDraft, approvedDraft.approvedModel);
assertReviewDraft(editAgainDraft);
assert.equal(editAgainDraft.status, "draft", "editing an approved model should return to draft review");
assert.equal(editAgainDraft.approvedModel, null, "editing again should clear the previously approved model");
assert.equal(editAgainDraft.reviewedModel.flight.price, 1520, "editing again should start from the last approved correction");
assert.equal(editAgainDraft.originalModel.flight.price, 1475, "editing again must still preserve the original extraction");

const resetDraft = createReviewDraft(editAgainDraft.originalModel);
assertReviewDraft(resetDraft);
assert.equal(resetDraft.status, "draft", "reset should return to draft state");
assert.equal(resetDraft.hasManualEdits, false, "reset should clear manual edit marker");
assert.equal(resetDraft.reviewedModel.flight.price, 1475, "reset should restore extracted flight price");
assert.equal(resetDraft.reviewedModel.hotelOptions[0].price, 11200, "reset should restore extracted hotel price");

console.log("GT63 REVIEW DRAFT REGRESSION PASS");
