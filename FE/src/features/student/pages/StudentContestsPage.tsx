import React from "react";
import { useParams } from "react-router";
import { ContestDetailView } from "../components/contests/ContestDetailView";
import { ContestListView } from "../components/contests/ContestListView";

export function StudentContestsPage() {
  const { contestId } = useParams<{ contestId: string }>();
  return contestId ? <ContestDetailView contestId={contestId} /> : <ContestListView />;
}
