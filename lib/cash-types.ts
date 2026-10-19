// Types for the Cash snapshot (cash.json). Mirrors docs/finance/schema/cash.schema.json.
export type CashSnapshot = {
  schemaVersion: number;
  generatedAt: string;
  asOf: string;
  headline: {
    t30dNetBurnCad: number;
    vsYesterdayCad: number | null;
    vs30dAgoCad: number | null;
    dataThrough: string;
    definition: string;
  };
  series: { date: string; value: number }[];
  action: { title: string; why: string; where: string } | null;
  savings: {
    bankedCadMo: number;
    planCadMo: number;
    outsidePlan: { item: string; cadMo: number; effective: string }[];
  };
  corpMove: {
    movedCount: number;
    totalCount: number;
    movedCadMo: number;
    totalCadMo: number;
    note: string;
  };
  tasks: {
    id: string;
    title: string;
    who: "gui" | "bot";
    deadline: string;
    done: string;
    burnCadMo: number;
  }[];
  interest: {
    name: string;
    scope: string;
    kind: string;
    avgMonthCad: number | null;
    note: string;
  }[];
  sources: { id: string; name: string; asOf: string; checkedAt: string; note: string }[];
};
