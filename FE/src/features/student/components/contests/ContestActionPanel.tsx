import React from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/assets/icons";
import type { StudentContest } from "@/services/studentContest.service";
import { formatCountdown, useCountdown } from "./contestHelpers";

export function ContestActionPanel({
  contest,
  busy,
  onRegister,
  onStart,
}: {
  contest: StudentContest;
  busy: "register" | "start" | number | null;
  onRegister: () => void;
  onStart: () => void;
}) {
  const countdown = useCountdown(contest.startTime, contest.status === "UPCOMING");
  const isFull =
    Boolean(contest.maxParticipants) && contest.registeredCount >= contest.maxParticipants!;

  let heading = "";
  let body = "";
  let action: React.ReactNode = null;
  let tone = "bg-surface-muted text-content-secondary";

  if (contest.status === "UPCOMING" && !contest.isRegistered) {
    heading = isFull ? "This contest is full" : "Registration is open";
    body = isFull
      ? "All spots are taken."
      : countdown != null
        ? `Starts in ${formatCountdown(countdown)}. Register now to secure your spot.`
        : "Register now to secure your spot.";
    tone = "bg-primary-light text-primary";
    action = (
      <Button
        className="w-full"
        onClick={onRegister}
        loading={busy === "register"}
        disabled={busy !== null || isFull}
      >
        Register
      </Button>
    );
  } else if (contest.status === "UPCOMING") {
    heading = "You’re registered";
    body =
      countdown != null
        ? `Starts in ${formatCountdown(countdown)}. Come back when the contest goes live.`
        : "Come back when the contest goes live.";
    tone = "bg-success/10 text-success";
  } else if (contest.status === "ONGOING" && contest.isRegistered) {
    heading = "The contest is live";
    body = `You have ${contest.durationMinutes} minutes once you start. The timer can’t be paused.`;
    tone = "bg-success/10 text-success";
    action = (
      <Button
        className="w-full"
        icon={<Icon.Zap className="h-4 w-4" />}
        onClick={onStart}
        loading={busy === "start"}
        disabled={busy !== null}
      >
        Start contest
      </Button>
    );
  } else if (contest.status === "ONGOING") {
    heading = "Live now";
    body = "Only registered students can start this contest.";
  } else if (contest.status === "CANCELLED") {
    heading = "Contest cancelled";
    body = "This contest will not take place.";
    tone = "bg-danger/10 text-danger";
  } else {
    heading = "Contest ended";
    body = contest.isRegistered
      ? "Your result and rewards are shown below."
      : "You can view the final leaderboard.";
  }

  return (
    <section className="card space-y-3 p-4">
      <div className={`rounded-lg px-3 py-2.5 ${tone}`}>
        <p className="text-sm font-semibold">{heading}</p>
        <p className="mt-0.5 text-xs leading-5 opacity-90">{body}</p>
      </div>
      {action}
    </section>
  );
}
