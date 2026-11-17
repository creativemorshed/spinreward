import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SpinWheel from "@/components/SpinWheel";
import { getAdmin } from "@/lib/supabase-admin";
import type { PublicRestaurant } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

async function loadRestaurant(slug: string): Promise<PublicRestaurant | null> {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return null;

  const admin = getAdmin();
  const { data: restaurant } = await admin
    .from("restaurants")
    .select("id, name, slug")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (!restaurant) return null;

  const { data: rewards } = await admin
    .from("rewards")
    .select("position, label, discount_amount, color")
    .eq("restaurant_id", restaurant.id)
    .order("position", { ascending: true });
  if (!rewards || rewards.length !== 8) return null;

  return {
    name: restaurant.name,
    slug: restaurant.slug,
    // weight ইচ্ছাকরেই বাদ — কাস্টমারের সম্ভাবনা জানার দরকার নেই
    rewards: rewards.map((r) => ({
      position: r.position,
      label: r.label,
      discountAmount: r.discount_amount,
      color: r.color,
    })),
  };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const restaurant = await loadRestaurant(slug).catch(() => null);
  return {
    title: restaurant ? `${restaurant.name} — স্পিন করে জিতুন` : "স্পিন করে জিতুন",
    robots: { index: false },
  };
}

export default async function RestaurantSpinPage({ params }: { params: Params }) {
  const { slug } = await params;
  const restaurant = await loadRestaurant(slug);
  if (!restaurant) notFound();

  return <SpinWheel slug={restaurant.slug} restaurantName={restaurant.name} rewards={restaurant.rewards} />;
}
