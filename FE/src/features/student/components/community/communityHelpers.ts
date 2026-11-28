import type { DiscussionItem } from "@/services/studentCommunity.service";

export const PAGE_SIZE = 10;

export type CommunityTab = "Discussions" | "My Discussions" | "Tips" | "Announcements";

export function formatDate(value: string | null) {
  return value
    ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "—";
}

export function emptyTitle(tab: CommunityTab, filtered: boolean) {
  if (tab === "My Discussions") {
    return filtered ? "No posts match these filters" : "You haven't posted yet";
  }
  if (tab === "Tips") return "No tips yet";
  if (tab === "Announcements") return "No announcements yet";
  return "No discussions found";
}

export function emptyMessage(tab: CommunityTab, filtered: boolean) {
  if (tab === "My Discussions") {
    return filtered
      ? "Try changing your search or status filters."
      : "Posts you create will appear here, including posts waiting for review.";
  }
  if (tab === "Tips") return "Helpful tips from students will appear here.";
  if (tab === "Announcements") return "Announcements from your managers will appear here.";
  return "Start a discussion with the community.";
}

export function authorAvatar(author: DiscussionItem["author"], isAnonymous = false) {
  const anonymousName = author.displayName.toLowerCase().includes("anonymous");
  return isAnonymous || anonymousName
    ? "/images/anonymous_student.png"
    : author.avatarUrl || undefined;
}
