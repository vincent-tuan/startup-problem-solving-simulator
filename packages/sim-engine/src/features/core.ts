import { decayEvidence } from "../domains/evidence";
import { validateFinance } from "../domains/finance";
import {
  advanceAccount, disqualifyAccount, engageAccountStakeholder, negotiateContract, sourceAccount, updateMarketMetrics,
} from "../domains/market";
import type { SimulationFeature } from "./contracts";
import { competitorFeature, marketIntelligenceFeature } from "./competitors";
import { FeatureRegistry } from "./registry";

const manifest = (id: string, dependencies: string[] = []): SimulationFeature => ({ id, version: "1.0.0", dependencies });

const financeFeature: SimulationFeature = { ...manifest("finance-and-tax"), validate: validateFinance };
const marketFeature: SimulationFeature = {
  ...manifest("market"), hooks: {
    after_scheduled_effects: ({ state }) => updateMarketMetrics(state),
    after_financial_close: ({ state }) => updateMarketMetrics(state),
    after_command: ({ state }) => updateMarketMetrics(state),
  },
};
const evidenceFeature: SimulationFeature = { ...manifest("evidence", ["market"]), hooks: { after_scheduled_effects: ({ state }) => decayEvidence(state) } };
const productFeature = manifest("product-and-technology", ["finance-and-tax"]);
const stakeholderFeature = manifest("stakeholders-and-obligations");

const customerFeature: SimulationFeature = {
  ...manifest("customers-and-sales", ["evidence", "finance-and-tax", "market", "product-and-technology", "stakeholders-and-obligations"]),
  commands: {
    "account.manage": ({ state, command, emit }) => {
      if (command.type !== "account.manage") return;
      if (command.payload.operation === "source") sourceAccount(state, command.payload.segmentId ?? state.market.segments[0]?.id, emit);
      else if (command.payload.operation === "advance") advanceAccount(state, command.payload.accountId ?? "", emit);
      else disqualifyAccount(state, command.payload.accountId ?? "", emit);
    },
    "account.engage_stakeholder": ({ state, command, emit }) => {
      if (command.type === "account.engage_stakeholder") engageAccountStakeholder(state, command.payload.accountId, command.payload.stakeholderId, command.payload.intent, emit);
    },
    "contract.negotiate": ({ state, command, emit }) => {
      if (command.type !== "contract.negotiate") return;
      negotiateContract(state, command.payload.accountId, command.payload.price, command.payload.contractMonths, command.payload.discountForPrepay, {
        paymentTermsDays: command.payload.paymentTermsDays, onboardingMode: command.payload.onboardingMode,
        supportSlaHours: command.payload.supportSlaHours, dataTerms: command.payload.dataTerms,
      }, emit);
      return { checkpoint: true };
    },
  },
};

export const CORE_FEATURES: SimulationFeature[] = [
  financeFeature,
  marketFeature,
  evidenceFeature,
  productFeature,
  stakeholderFeature,
  customerFeature,
  manifest("marketing-and-channels", ["customers-and-sales", "finance-and-tax"]),
  manifest("people-and-founder", ["finance-and-tax", "stakeholders-and-obligations"]),
  manifest("vendors-and-operations", ["finance-and-tax", "product-and-technology"]),
  manifest("legal-and-compliance", ["product-and-technology", "stakeholders-and-obligations"]),
  manifest("capital-and-governance", ["evidence", "finance-and-tax", "stakeholders-and-obligations"]),
  manifest("macro-and-seasonality", ["market"]),
  marketIntelligenceFeature,
  competitorFeature,
];

export const featureRegistry = new FeatureRegistry(CORE_FEATURES);
