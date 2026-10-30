// ABOUTME: A reviewer-code entry, separate from the product's personal onboarding and local facts.
import { ReviewerAccess } from "@/ui/reviewer-access";
import { safeReviewDestination } from "@/server/reviewer-access";
export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return (
    <ReviewerAccess
      destination={safeReviewDestination((await searchParams).next)}
    />
  );
}
