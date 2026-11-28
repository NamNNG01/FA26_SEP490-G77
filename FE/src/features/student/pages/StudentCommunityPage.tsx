import React from "react";
import { useParams } from "react-router";
import { DiscussionDetailView } from "../components/community/DiscussionDetailView";
import { DiscussionListView } from "../components/community/DiscussionListView";

export function StudentCommunityPage() {
  const { discussionId } = useParams<{ discussionId: string }>();
  return discussionId ? <DiscussionDetailView discussionId={discussionId} /> : <DiscussionListView />;
}
