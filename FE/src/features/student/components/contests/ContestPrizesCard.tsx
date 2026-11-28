import React from "react";
import { Icon } from "@/assets/icons";
import type { ContestPrize } from "@/services/studentContest.service";
import { RankMedal } from "@/features/contest/components/contestUi";
import { prizeText } from "./contestHelpers";

export function ContestPrizesCard({
  prizes,
  ownRank,
}: {
  prizes: ContestPrize[];
  ownRank?: number | null;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-line p-4">
        <h2 className="font-semibold text-content">Prizes</h2>
        <p className="mt-0.5 text-xs text-content-subtle">Finish in one of these ranks to win.</p>
      </div>
      <ul className="divide-y divide-line">
        {[...prizes]
          .sort((a, b) => a.rankPosition - b.rankPosition)
          .map((prize) => (
            <li
              key={prize.rankPosition}
              className={`flex items-center gap-3 px-4 py-3 text-sm ${
                ownRank === prize.rankPosition ? "bg-primary-light/50" : ""
              }`}
            >
              <RankMedal rank={prize.rankPosition} />
              <span className="min-w-0 flex-1 truncate font-medium text-content">
                {prizeText(prize)}
              </span>
              <Icon.Award className="h-4 w-4 flex-shrink-0 text-warning" />
            </li>
          ))}
      </ul>
    </section>
  );
}
